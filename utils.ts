import {
  ASTPath,
  CallExpression,
  JSCodeshift,
  Collection,
  BlockStatement,
  VariableDeclarator,
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

export const findVariableDeclarator = (
  name: string,
  p: ASTPath,
  j: JSCodeshift
) => {
  let declarator: ASTPath<VariableDeclarator> | undefined = undefined;

  if (!p) {
    return undefined;
  }

  // get the parent block
  const thisBlock = findParentBlock(p);
  if (thisBlock && thisBlock.value.type === "BlockStatement") {
    const thisBlockLocStart = thisBlock.value.loc?.start;
    j(thisBlock)
      .findVariableDeclarators(name)
      .at(0)
      .map((varDeclarePath) => {
        debug("found variable:", varDeclarePath.value.loc?.start);
        // TODO: check the location

        // get the parent block of the variable
        const variableParentBlock = findParentBlock(varDeclarePath);
        if (
          variableParentBlock?.value.type === "BlockStatement" &&
          variableParentBlock.value.loc?.start.line === thisBlockLocStart?.line
        ) {
          declarator = varDeclarePath;
        }
        return null;
      });
  } else {
    return undefined;
  }

  if (!declarator) {
    return findParentBlock(thisBlock);
  }

  return declarator;
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
      }
      const parentFunctionPath = findParentFunction(p3);
      // debug("parent function path", parentFunctionPath?.value);
      if (parentFunctionPath) {
        // TODO: check if this followed by .then expression
        if (setFunctionAsync(parentFunctionPath)) {
          changed = true;
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
        }
        const parentFunctionPath = findParentFunction(p);
        // debug("parent function path", parentFunctionPath?.value);
        if (parentFunctionPath) {
          // TODO: check if this followed by .then expression
          if (setFunctionAsync(parentFunctionPath)) {
            changed = true;
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

export const getFileContent = (path: string): string | undefined => {
  let fileContent: Buffer | null = null;

  if (/(\.js|\.ts)$/.test(path)) {
    try {
      fileContent = fs.readFileSync(path);
    } catch (e) {
      debug("File was not found:", path);
    }
  } else {
    try {
      fileContent = fs.readFileSync(path + ".js");
    } catch (e) {
      try {
        fileContent = fs.readFileSync(path + ".ts");
      } catch (e2) {
        // check for index file
        try {
          fileContent = fs.readFileSync(path + "/index.js");
        } catch (e3) {
          try {
            fileContent = fs.readFileSync(path + "/index.ts");
          } catch (e4) {
            debug("File was not found");
          }
        }
      }
    }
  }

  // debug("content", fileContent.toString());
  return fileContent?.toString();
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
