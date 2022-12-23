import {
  ASTPath,
  CallExpression,
  JSCodeshift,
  Collection,
  BlockStatement,
  VariableDeclarator,
  JSXElement,
  SourceLocation,
  ImportDeclaration,
} from "jscodeshift";
import fs from "fs";
import CONSTANTS from "./constants";

const debug = require("debug")("transform:utils");

export const addAwaitKeyword = (p: ASTPath<CallExpression>, j: JSCodeshift) => {
  // debug('need add await', j(p).toSource(), p)
  if (p.parentPath?.value.type === "AwaitExpression") {
    debug("already has await expression");
    return false;
  }

  debug("add await keyword", p.parentPath.parentPath.value);
  if (findParentPromiseAll(p)) {
    debug("has Promise.all parent");
    return false;
  }

  if (
    p.parentPath.value.type === "MemberExpression" &&
    p.parentPath.value.property.type === "Identifier" &&
    p.parentPath.value.property.name === "then"
  ) {
    debug("handle promise by then()");
    return false;
  }

  const awaitNode = j.awaitExpression(p.value);
  debug(j(awaitNode).toSource());
  debug(j(p.value).toSource());
  j(p).replaceWith(awaitNode);
  return true;
};

export const findParentPromiseAll = (p: ASTPath) => {
  if (!p || p.parentPath.value.type === "BlockStatement") {
    return;
  }

  if (
    p.parentPath.value.type === "CallExpression" &&
    p.parentPath.value.callee.type === "MemberExpression"
  ) {
    const { object, property } = p.parentPath.value.callee;
    if (
      object.type === "Identifier" &&
      object.name === "Promise" &&
      property.type === "Identifier" &&
      property.name === "all"
    ) {
      return p.parent;
    }
  }

  return findParentPromiseAll(p.parentPath);
};

export const findParentFunction = (p: ASTPath): ASTPath | undefined => {
  if (!p.parentPath) {
    return undefined;
  }
  // debug("find parent function of this", p);

  // debug("parent", p.parentPath.value?.loc?.start);
  if (
    [
      "ArrowFunctionExpression",
      "FunctionExpression",
      "FunctionDeclaration",
      "ObjectMethod",
      "ClassMethod",
    ].includes(p.parentPath.value.type)
  ) {
    return p.parentPath;
  }

  if (p.parentPath) {
    return findParentFunction(p.parentPath);
  }

  return undefined;
};

export const findParentCallExpression = (
  p: ASTPath
): ASTPath<CallExpression> | undefined => {
  if (!p.parentPath) {
    return undefined;
  }
  // debug("find parent call expression of this", p, p.value);

  // debug("parent", p.parentPath.value?.loc?.start);
  if (
    ["CallExpression", "OptionalCallExpression"].includes(
      p.parentPath.value.type
    )
  ) {
    return p.parentPath;
  }

  if (p.parentPath) {
    return findParentCallExpression(p.parentPath);
  }

  return undefined;
};

export const findParentObject = (p: ASTPath): ASTPath | undefined => {
  if (!p) {
    debug("invalid p", p);
    return undefined;
  }
  // debug("parent", p.parentPath.value?.loc?.start);
  if (["VariableDeclarator"].includes(p.value.type)) {
    return p;
  }

  if (p.parentPath) {
    return findParentObject(p.parentPath);
  }
  debug("No parent found:", p);
  return undefined;
};

export const findParentBlock = (p: ASTPath): ASTPath | undefined => {
  if (!p) {
    debug("findParentBlock, invalid p", p);
    return undefined;
  }
  if (p.value.type === "BlockStatement") {
    return p;
  }
  if (!p.parentPath) {
    // root of the file?
    return p;
  } else {
    return findParentBlock(p.parentPath);
  }
};

export const getLocation = (p: ASTPath): SourceLocation | undefined => {
  if (!p) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(p.value, "loc")) {
    return p.value.loc;
  }

  return getLocation(p.parentPath);
};

export const findVariableDeclarator = (
  name: string,
  p: ASTPath,
  j: JSCodeshift
) => {
  let declarator: ASTPath<VariableDeclarator> | undefined = undefined;

  if (!p) {
    return undefined;
  }

  let pathToFindIn: ASTPath | undefined = undefined;
  let startLine: number | undefined = undefined;

  // get the parent block
  const thisBlock = findParentBlock(p);
  if (!thisBlock) {
    pathToFindIn = p;
    startLine = getLocation(p)?.start.line;
  } else {
    pathToFindIn = thisBlock;
    startLine = getLocation(thisBlock)?.start.line;
  }

  j(pathToFindIn)
    .findVariableDeclarators(name)
    .map((varDeclarePath) => {
      debug("found variable:", varDeclarePath.value.loc?.start);
      // TODO: check the location

      // get the parent block of the variable
      const variableParentBlock = findParentBlock(varDeclarePath);

      switch (variableParentBlock?.value.type) {
        case "File":
          declarator = varDeclarePath;
          break;
        case "BlockStatement": {
          if (startLine) {
            if (variableParentBlock.value.loc?.start.line === startLine) {
              declarator = varDeclarePath;
            }
          } else {
            debug("variableParentBlock", variableParentBlock);
            debug("startLine", startLine);
            declarator = varDeclarePath;
          }
          break;
        }
      }

      return null;
    });

  if (!declarator) {
    return findVariableDeclarator(name, pathToFindIn.parentPath, j);
  }

  return declarator;
};

export const findImportNodeByVariableName = (
  name: string,
  rootCollection: Collection,
  j: JSCodeshift
) => {
  let importNode: ImportDeclaration | undefined;
  // find all imported async functions
  const importedNodes = rootCollection.find(j.ImportDeclaration);
  importedNodes.map((p) => {
    debug("imported node source:", j(p).toSource());
    p.value.specifiers?.map((spec) => {
      if (
        spec.local?.name === name &&
        typeof p.value.source.value === "string"
      ) {
        importNode = p.value;
      }
      return null;
    });
    return null;
  });

  return importNode;
};

export const setFunctionAsync = (p: ASTPath) => {
  if (
    p.value.type === "ArrowFunctionExpression" ||
    p.value.type === "FunctionDeclaration" ||
    p.value.type === "FunctionExpression" ||
    p.value.type === "ObjectMethod" ||
    p.value.type === "ClassMethod"
  ) {
    debug("set function async", p.value.loc?.start);
    if (p.value.async === true) {
      return false;
    }
    p.value.async = true;
    return true;
  }
  return false;
};

export const setFunctionNotAsync = (p: ASTPath) => {
  if (
    p.value.type === "ArrowFunctionExpression" ||
    p.value.type === "FunctionDeclaration" ||
    p.value.type === "FunctionExpression" ||
    p.value.type === "ObjectMethod" ||
    p.value.type === "ClassMethod"
  ) {
    debug("set function async", p.value.loc?.start);
    if (p.value.async === false) {
      return false;
    }
    p.value.async = false;
    return true;
  }
  return false;
};

export const convertAllCallExpressionToAsync = (
  name: string,
  collection: Collection,
  j: JSCodeshift
) => {
  debug(
    `convert all functions use the async function which has the name is ${name} to async:`
  );
  // find all function call then add await to
  let changed = false;
  collection
    .find(j.CallExpression, {})
    .filter(
      (p2) =>
        p2.value.callee.type === "Identifier" && p2.value.callee.name === name
    )
    .map((p3) => {
      if (addAwaitKeyword(p3, j)) {
        changed = true;

        const parentFunctionPath = findParentFunction(p3);
        // debug("parent function path", parentFunctionPath?.value);
        if (parentFunctionPath) {
          setFunctionAsync(parentFunctionPath);
        }
      }
      return null;
    });
  return changed;
};

export const convertAllMemberExpressionCallToAsync = (
  objectName: string,
  propertyName: string,
  collection: Collection,
  j: JSCodeshift
) => {
  debug(
    `convert all functions use the async function ${objectName}.${propertyName}() to async:`
  );
  let changed = false;
  // find all function call then add await to
  collection.find(j.CallExpression, {}).map((p) => {
    // debug("call expression:", p.value.callee);
    if (p.value.callee.type === "MemberExpression") {
      const { object: calleeObject, property: calleeProperty } = p.value.callee;
      if (
        calleeObject.type === "Identifier" &&
        calleeObject.name === objectName &&
        calleeProperty.type === "Identifier" &&
        calleeProperty.name === propertyName
      ) {
        // debug("add await expression", p);
        if (addAwaitKeyword(p, j)) {
          changed = true;
          const parentFunctionPath = findParentFunction(p);
          // debug("parent function path", parentFunctionPath?.value);
          if (parentFunctionPath) {
            setFunctionAsync(parentFunctionPath);
          }
        }
      }
    }
    return null;
  });
  return changed;
};

export const getFunctionLocation = (p: ASTPath) => {
  switch (p.value.type) {
    case "ArrowFunctionExpression":
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ObjectMethod":
    case "ClassMethod":
      if (p.value.loc) {
        return {
          start: p.value.loc?.start,
          end: p.value.loc?.end,
        };
      }
      break;
    default:
      debug("Unhandled function type:", p.value.type);
  }
};

export const getFileContent = (path: string) => {
  let fileContent: Buffer | null = null;
  let realPath: string | undefined;

  if (/(\.js|\.ts)$/.test(path)) {
    try {
      realPath = path;
      fileContent = fs.readFileSync(realPath);
    } catch (e) {
      debug("File was not found:", realPath);
    }
  } else {
    try {
      realPath = path + ".js";
      fileContent = fs.readFileSync(realPath);
    } catch (e) {
      try {
        realPath = path + ".ts";
        fileContent = fs.readFileSync(realPath);
      } catch (e2) {
        // check for index file
        try {
          realPath = path + "/index.js";
          fileContent = fs.readFileSync(realPath);
        } catch (e3) {
          try {
            realPath = path + "/index.ts";
            fileContent = fs.readFileSync(realPath);
          } catch (e4) {
            debug("File was not found");
          }
        }
      }
    }
  }

  // debug("content", fileContent.toString());
  return {
    content: fileContent?.toString(),
    realPath,
  };
};

export const getPathFromSource = (source: string): string => {
  return source.replace(/\/([^\/]+)$/, "");
};

export const getRealImportSource = (
  importPath: string,
  currentPath: string
): string => {
  if (/^\//.test(importPath)) {
    return CONSTANTS.METEOR_ROOT_DIRECTORY + importPath;
  }
  return getPathFromSource(currentPath) + "/" + importPath.replace(/^\.\//, "");
};

export const isMongoCollection = (name: string, collection: Collection) => {
  let result = false;
  collection
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

export type ComponentPropsType = { [key: string]: any };

export const getComponentProps = (
  p: ASTPath<JSXElement>,
  j: JSCodeshift,
  parentComponentProps?: ComponentPropsType
) => {
  debug("_BEGIN getComponentProps");

  const { attributes } = p.value.openingElement;
  debug("_attributes", attributes);

  let props: ComponentPropsType = {};

  attributes?.map((att) => {
    switch (att.type) {
      case "JSXAttribute": {
        // get the prop name:
        let propName = "";
        switch (att.name.type) {
          case "JSXIdentifier":
            propName = att.name.name;
            break;
        }

        if (!propName) {
          debug("__No prop name found");
          break;
        }

        if (!att.value) {
          // e.g: <SomeComponent isActive />
          props[propName] = true;
        } else {
          switch (att.value.type) {
            case "JSXExpressionContainer": {
              // e.g: <Component someProp={someVar} />
              debug("___att.value.expression", att.value.expression);
              const { expression } = att.value;
              switch (expression.type) {
                case "Identifier": {
                  // e.g: <Component someProp={someVar} />
                  debug("____attribute variable name:", expression.name);
                  // now find the variable, check if it was async function
                  // first, find in parent component props
                  if (
                    parentComponentProps &&
                    parentComponentProps[expression.name]
                  ) {
                    debug(
                      "____found in parent component props:",
                      parentComponentProps[expression.name]
                    );
                    props[propName] = parentComponentProps[expression.name];
                  } else {
                    const variable = findVariableDeclarator(
                      expression.name,
                      p,
                      j
                    );
                    debug("____attribute variable:", variable);
                    if (variable) {
                      props[propName] = variable.value.init;
                    }
                  }

                  break;
                }
                case "ArrowFunctionExpression":
                // e.g: <Component someProp={() => {})} />
                case "FunctionExpression": {
                  // e.g: <Component someProp={function () {}} />
                  props[propName] = expression;
                  break;
                }
              }

              break;
            }
            case "StringLiteral": {
              // e.g: <Component myProp="My value" />
              props[propName] = att.value;

              break;
            }
          }
        }
        break;
      }
      case "JSXSpreadAttribute": {
        // e.g: {...props}
        debug("__JSXSpreadAttribute", att);
        switch (att.argument.type) {
          case "Identifier": {
            // e.g: {...props}
            // first, find in the parent component props
            if (
              parentComponentProps &&
              parentComponentProps[att.argument.name]
            ) {
              debug(
                "____found in parent component props:",
                parentComponentProps[att.argument.name]
              );
              props = { ...props, ...parentComponentProps[att.argument.name] };

              break;
            }

            const bigProps = findVariableDeclarator(att.argument.name, p, j);
            if (bigProps) {
              debug("___found spread attribute variable:", bigProps);
              switch (bigProps.value.type) {
                case "VariableDeclarator": {
                  // e.g: const props = { v: "V" }
                  debug("____variable declarator init:", bigProps.value.init);
                  switch (bigProps.value.init?.type) {
                    case "ObjectExpression": {
                      const { properties } = bigProps.value.init;
                      debug("_____Object expression properties:", properties);
                      properties.forEach((pr) => {
                        if (pr.type === "ObjectProperty") {
                          // get the property name
                          let prName = "";
                          switch (pr.key.type) {
                            case "Identifier":
                              prName = pr.key.name;
                              break;
                          }

                          if (prName && pr.value) {
                            props[prName] = pr.value;
                          }
                        }
                      });
                      break;
                    }
                  }

                  break;
                }
              }
            }
            break;
          }
        }

        break;
      }
    }
  });

  debug("_END getComponentProps");

  return props;
};

export const getComponentName = (p: ASTPath<JSXElement>) => {
  debug("_BEGIN getComponentName:");
  debug(p.value.openingElement.name);
  const { name } = p.value.openingElement;
  switch (name.type) {
    case "JSXIdentifier":
      return name.name;
  }

  debug("_END getComponentName:");
};
