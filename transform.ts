import {
  FileInfo,
  API,
  Options,
  ASTPath,
  MemberExpression,
  ExpressionStatement,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
} from "jscodeshift";

const methodsMapping = {
  findOne: "findOneAsync",
  insert: "insertAsync",
  upsert: "upsertAsync",
  update: "updateAsync",
  remove: "removeAsync",
  createIndex: "createIndexAsync",
  dropIndex: "dropIndexAsync",
  dropCollection: "dropCollectionAsync",
  // methods on cursors
  count: "countAsync",
  fetch: "fetchAsync",
  forEach: "forEachAsync",
  map: "mapAsync",
};

import {
  addAwaitKeyword,
  findParentCallExpression,
  findParentFunction,
  findVariableDeclarator,
  getFileContent,
  getRealImportSource,
  isMongoCollection,
  setFunctionAsync,
} from "./utils";

const tsParser = require("jscodeshift/parser/ts");

const debug = require("debug")("transform:script");
const debug2 = require("debug")("transform:print:script");

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `**************************************************
*** ${fileInfo.path}
**************************************************`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);
  // debug(rootCollection)

  const findImportPath = (variableName: string): undefined | ASTPath => {
    let importPath: undefined | ASTPath;
    rootCollection
      .find(j.Identifier, {
        name: variableName,
      })
      .at(0)
      .map((p2) => {
        if (p2.parent?.parent?.value.type === "ImportDeclaration") {
          importPath = p2.parent?.parent;
        }
        return null;
      });

    return importPath;
  };

  const checkedImportedVariables: { [key: string]: boolean } = {};

  const isImportMongoCollection = (name: string) => {
    if (checkedImportedVariables[name] === true) {
      return true;
    }
    if (checkedImportedVariables[name] === false) {
      return false;
    }

    const importPath = findImportPath(name);
    if (
      importPath &&
      importPath.value.type === "ImportDeclaration" &&
      importPath.value.source.type === "StringLiteral"
    ) {
      debug("import type", importPath.value);
      debug("import path", importPath.value.source.value);

      let importSpec = "";
      importPath.value.specifiers?.map((spec) => {
        debug("spec.local?.name", spec.local?.name);
        if (spec.local?.name !== name) {
          return;
        }
        switch (spec.type) {
          case "ImportDefaultSpecifier": {
            importSpec = "default";
            break;
          }
          case "ImportSpecifier": {
            importSpec = "named";
            break;
          }
          default:
            debug("Unhandled import specifier type:", spec.type);
        }
      });

      // open file to read
      const realImportSource = getRealImportSource(
        importPath.value.source.value,
        fileInfo.path
      );
      debug({ realImportSource });

      const { content: fileContent } = getFileContent(realImportSource);
      // debug("content\n", fileContent);

      if (!fileContent) {
        checkedImportedVariables[name] = false;
        return false;
      }

      const handleExportDeclaration = (
        node: ExportDefaultDeclaration | ExportNamedDeclaration
      ) => {
        let isThisMongoCollection = false;
        debug("export node", node);
        switch (node.declaration?.type) {
          case "Identifier":
            if (node.declaration.name === name) {
              if (isMongoCollection(name, importedRootCollection)) {
                isThisMongoCollection = true;
              }
            }
            break;
          case "VariableDeclaration": {
            debug("variable declaration:", node.declaration.declarations);
            let is;
            node.declaration.declarations.map((dp) => {
              if (
                dp.type === "VariableDeclarator" &&
                dp.id.type === "Identifier" &&
                dp.id.name === name
              ) {
                switch (dp.init?.type) {
                  case "Identifier":
                    // find the variable
                    if (
                      isMongoCollection(dp.init.name, importedRootCollection)
                    ) {
                      isThisMongoCollection = true;
                    }
                    break;
                  case "NewExpression":
                    if (isMongoCollection(dp.id.name, importedRootCollection)) {
                      isThisMongoCollection = true;
                    }
                    break;
                }
              }
            });
            break;
          }
          default:
            debug("Unhandled export declaration type:", node.declaration?.type);
        }

        return isThisMongoCollection;
      };

      const importedRootCollection = j(fileContent, { parser: tsParser });
      // debug(
      //   "imported root collection",
      //   importedRootCollection,
      //   importedRootCollection.toSource()
      // );

      // find the export variable
      let isExportedMongoCollection = false;
      switch (importSpec) {
        case "default":
          importedRootCollection.find(j.ExportDefaultDeclaration).map((xp) => {
            debug("export default node:", j(xp).toSource());
            if (handleExportDeclaration(xp.value)) {
              isExportedMongoCollection = true;
            }
            return null;
          });
          break;
        case "named":
          importedRootCollection.find(j.ExportNamedDeclaration).map((xp) => {
            debug("export named node:", j(xp).toSource());
            if (handleExportDeclaration(xp.value)) {
              isExportedMongoCollection = true;
            }
            return null;
          });
          break;
        default:
      }
      checkedImportedVariables[name] = isExportedMongoCollection;

      return isExportedMongoCollection;
    }
    checkedImportedVariables[name] = false;

    return false;
  };

  const checkCalleeObject = (callee: MemberExpression) => {
    debug("callee object", callee.object.loc?.start);
    switch (callee.object.type) {
      case "Identifier": {
        if (isImportMongoCollection(callee.object.name)) {
          return true;
        } else {
          debug("Not imported", callee.object.name);

          return isMongoCollection(callee.object.name, rootCollection);
        }
      }
      case "MemberExpression": {
        if (
          callee.object.object.type === "Identifier" &&
          callee.object.object.name === "Meteor" &&
          callee.object.property.type === "Identifier" &&
          callee.object.property.name === "users"
        ) {
          return true;
        }
        break;
      }
      default:
        debug("unhandled callee object type", callee.object);
        break;
    }

    return false;
  };

  const checkIsCursorPreCallee = (
    preCallee: ExpressionStatement["expression"]
  ) => {
    let isCursorCall = false;
    if (
      preCallee.type === "MemberExpression" &&
      preCallee.property.type === "Identifier" &&
      preCallee.property.name === "find"
    ) {
      isCursorCall = true;
    }

    return isCursorCall;
  };

  // find all Member expression
  rootCollection.find(j.MemberExpression).map((p) => {
    // debug("found member expression", p.value);
    if (p.value.property.type === "Identifier") {
      switch (p.value.property.name) {
        case "findOne":
        case "insert":
        case "upsert":
        case "update":
        case "remove":
        case "createIndex":
        case "dropIndex":
        case "dropCollection": {
          if (!checkCalleeObject(p.value)) {
            break;
          }

          // convert rename property
          p.value.property.name = methodsMapping[p.value.property.name];

          const callExpression = findParentCallExpression(p);
          if (callExpression) {
            if (addAwaitKeyword(callExpression, j)) {
              fileChanged = true;
            }
            // set parent function async
            const parentFunction = findParentFunction(callExpression);
            if (parentFunction) {
              if (setFunctionAsync(parentFunction)) {
                fileChanged = true;
              }
            }
          }

          break;
        }
        case "count":
        case "fetch":
        case "forEach":
        case "map": {
          debug("cursors methods");
          debug(j(p).toSource());
          debug("p.value.object", p.value.object);
          switch (p.value.object.type) {
            case "CallExpression": {
              // check to make sure we call find() method in the chaining call
              const preCallee = p.value.object.callee;
              debug("preCallee", preCallee);
              if (!checkIsCursorPreCallee(preCallee)) {
                debug("not a cursor");
                break;
              }

              // convert rename property
              p.value.property.name = methodsMapping[p.value.property.name];

              const callExpression = findParentCallExpression(p);
              if (callExpression) {
                if (addAwaitKeyword(callExpression, j)) {
                  fileChanged = true;
                }
                // set parent function async
                const parentFunction = findParentFunction(callExpression);
                if (parentFunction) {
                  if (setFunctionAsync(parentFunction)) {
                    fileChanged = true;
                  }
                }
              } else {
                debug("call expression was not found");
              }

              break;
            }
            case "Identifier": {
              // find the variable definition, then somehow check to make sure it's returned by calling find() function
              let isCursorCall = false;
              const cursorVariableName = p.value.object.name;
              const variableDeclarator = findVariableDeclarator(
                cursorVariableName,
                p,
                j
              );
              // debug("variable declarator", variableDeclarator);
              if (
                variableDeclarator &&
                variableDeclarator.value.type === "VariableDeclarator"
              ) {
                switch (variableDeclarator.value.init?.type) {
                  case "CallExpression":
                    const preCallee = variableDeclarator.value.init.callee;
                    // debug('pre callee', preCallee)
                    if (!checkIsCursorPreCallee(preCallee)) {
                      break;
                    }

                    isCursorCall = true;

                    break;
                  default:
                    debug(
                      `Unhandled cursor declaration init type ${variableDeclarator.value.init?.type}`
                    );
                    break;
                }
              }

              if (isCursorCall) {
                const callExpression = findParentCallExpression(p);
                if (callExpression) {
                  // convert rename property
                  p.value.property.name = methodsMapping[p.value.property.name];

                  if (addAwaitKeyword(callExpression, j)) {
                    fileChanged = true;
                  }
                  // set parent function async
                  const parentFunction = findParentFunction(callExpression);
                  if (parentFunction) {
                    if (setFunctionAsync(parentFunction)) {
                      fileChanged = true;
                    }
                  }
                }
              }

              break;
            }
            default:
              debug(
                `Unhanded cursors method: ${p.value.property.name} with callee object type is ${p.value.object.type}`
              );
              break;
          }
          // debug('cursors methods', callee.property.name, p.value)

          break;
        }
        default:
          debug("Unhandled callee property:", p.value.property.name);
      }
    }

    return null;
  });

  debug("**************************************************");

  if (fileChanged) {
    debug2("file changed:", fileInfo.path);
    return rootCollection.toSource();
  }
};
