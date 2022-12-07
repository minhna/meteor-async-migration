import {
  FileInfo,
  API,
  Options,
  ASTPath,
  Collection,
  MemberExpression,
  CallExpression,
  ExpressionStatement,
  FunctionDeclaration,
  ArrowFunctionExpression,
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

const debug = require("debug")("transform:script");

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `**************************************************
*** ${fileInfo.path}
**************************************************`
  );
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

  const isMongoCollection = (name: string) => {
    let result = false;
    rootCollection
      .findVariableDeclarators(name)
      .at(0)
      .map((p6) => {
        // debug(p6.value.init)
        if (
          p6.value.type === "VariableDeclarator" &&
          p6.value.init?.type === "NewExpression" &&
          p6.value.init.callee.type === "MemberExpression"
        ) {
          const { object, property } = p6.value.init.callee;
          if (
            object.type === "Identifier" &&
            object.name === "Mongo" &&
            property.type === "Identifier" &&
            property.name === "Collection"
          ) {
            result = true;
          }
        }
        // declarationPath = p6
        return null;
      });
    if (!result) {
      debug(`Not a local declaration mongo collection: ${name}`);
    }
    return result;
  };

  const isImportMongoCollection = (name: string) => {
    const importPath = findImportPath(name);
    if (importPath && importPath.value.type === "ImportDeclaration") {
      const importSource = j(importPath).toSource();
      debug("import source", importSource);
      // debug(importPath.value.source.value)

      // You may want to make some double check here
      // but you must be aware of other collection, e.g: Meteor.users

      // in our case, we usually import the collection from schema file
      const schemaRegExp = /schema.*(\.js|\.ts|)$/;
      if (schemaRegExp.test(importSource)) {
        return true;
      }
      debug(`Unrecognized import source ${importPath.value.source.value}`);
    }
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

          return isMongoCollection(callee.object.name);
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

  const addAwaitKeyword = (p: ASTPath<CallExpression>) => {
    // debug('need add await', j(p).toSource(), p)
    const awaitNode = j.awaitExpression(p.value);
    debug(j(awaitNode).toSource());
    debug(j(p.value).toSource());
    j(p).replaceWith(awaitNode);
  };

  const handleFunctionInsideFunction = (
    p: ASTPath<FunctionDeclaration | ArrowFunctionExpression>,
    subCollection: Collection
  ) => {
    p.value.async = true;

    let functionName = p.value.id?.name;
    if (p.value.type === "ArrowFunctionExpression") {
      debug(
        "====>arrow function declaration",
        j(p.parentPath).toSource()
        // p.parentPath
      );
      functionName = p.parentPath.value.id.name;
    }

    // find all expressions of this function
    debug("***find all expressions of this function", functionName);
    debug(subCollection.toSource());
    subCollection
      .find(j.CallExpression, {})
      .filter(
        (p2) =>
          p2.value.callee.type === "Identifier" &&
          p2.value.callee.name === functionName
      )
      .map((p3) => {
        // debug('p3', p3)
        addAwaitKeyword(p3);
        return null;
      });
  };

  const handleFunctionSubCollection = (subCollection: Collection): boolean => {
    let needToBeAsync = false;

    // handle function declarations
    debug("find all functions inside");
    subCollection.find(j.ArrowFunctionExpression).map((p) => {
      debug("found function", j(p).toSource());
      if (handleFunctionSubCollection(j(p))) {
        needToBeAsync = true;

        handleFunctionInsideFunction(p, subCollection);
      }
      return null;
    });
    subCollection.find(j.FunctionDeclaration).map((p) => {
      debug("found function", j(p).toSource());
      if (handleFunctionSubCollection(j(p))) {
        needToBeAsync = true;

        handleFunctionInsideFunction(p, subCollection);
      }
      return null;
    });

    // handle call expressions
    subCollection.find(j.CallExpression, {}).map((p) => {
      // debug(j(p).toSource())
      const { callee } = p.value;
      switch (callee.type) {
        case "MemberExpression": {
          if (callee.property.type === "Identifier") {
            switch (callee.property.name) {
              case "findOne":
              case "insert":
              case "upsert":
              case "update":
              case "remove":
              case "createIndex":
              case "dropIndex":
              case "dropCollection": {
                if (!checkCalleeObject(callee)) {
                  break;
                }

                addAwaitKeyword(p);
                needToBeAsync = true;
                // convert to findOneAsync
                callee.property.name = methodsMapping[callee.property.name];

                break;
              }
              case "count":
              case "fetch":
              case "forEach":
              case "map": {
                debug("cursors methods");
                debug(j(p).toSource());
                // debug('callee.object', callee.object)
                switch (callee.object.type) {
                  case "CallExpression": {
                    // check to make sure we call find() method in the chaining call
                    const preCallee = callee.object.callee;
                    if (!checkIsCursorPreCallee(preCallee)) {
                      break;
                    }

                    addAwaitKeyword(p);
                    needToBeAsync = true;
                    // convert to findOneAsync
                    callee.property.name = methodsMapping[callee.property.name];

                    break;
                  }
                  case "Identifier": {
                    // find the variable definition, then somehow check to make sure it's returned by calling find() function
                    let isCursorCall = false;
                    const cursorVariableName = callee.object.name;
                    subCollection
                      .findVariableDeclarators(cursorVariableName)
                      .at(0)
                      .map((cursorDeclarePath) => {
                        // debug(
                        //   `cursor declare for ${cursorVariableName}`,
                        //   cursorDeclarePath.value
                        // )
                        debug(j(cursorDeclarePath).toSource());
                        if (
                          cursorDeclarePath.value.type === "VariableDeclarator"
                        ) {
                          switch (cursorDeclarePath.value.init?.type) {
                            case "CallExpression":
                              const preCallee =
                                cursorDeclarePath.value.init.callee;
                              // debug('pre callee', preCallee)
                              if (!checkIsCursorPreCallee(preCallee)) {
                                break;
                              }

                              isCursorCall = true;

                              break;
                            default:
                              debug(
                                `Unhandled cursor declaration init type ${cursorDeclarePath.value.init?.type}`
                              );
                              break;
                          }
                        }

                        return null;
                      });

                    if (isCursorCall) {
                      addAwaitKeyword(p);
                      needToBeAsync = true;
                      // convert to findOneAsync
                      callee.property.name =
                        methodsMapping[callee.property.name];
                    }

                    break;
                  }
                  default:
                    debug(
                      `Unhanded cursors method: ${callee.property.name} with callee object type is ${callee.object.type}`
                    );
                    break;
                }
                // debug('cursors methods', callee.property.name, p.value)

                break;
              }
              default:
                debug("Unhandled callee property", callee.property.name);
            }
          } else {
            debug("Unhandled callee type 2", callee);
          }
          break;
        }
        default:
        // debug('Unhandled callee type', callee)
      }
      return null;
    });
    return needToBeAsync;
  };

  // Just works with functions
  rootCollection.find(j.ArrowFunctionExpression).map((p) => {
    debug("Found function", j(p.value).toSource());
    if (handleFunctionSubCollection(j(p))) {
      p.value.async = true;
    }

    return null;
  });
  rootCollection.find(j.FunctionExpression).map((p) => {
    debug("Found function", j(p.value).toSource());
    if (handleFunctionSubCollection(j(p))) {
      p.value.async = true;
    }

    return null;
  });
  rootCollection.find(j.FunctionDeclaration).map((p) => {
    debug("Found function", j(p.value).toSource());
    if (handleFunctionSubCollection(j(p))) {
      p.value.async = true;
    }

    return null;
  });
  debug("**************************************************");

  return rootCollection.toSource();
};
