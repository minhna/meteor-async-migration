import { ASTPath, CallExpression, JSCodeshift, Collection } from "jscodeshift";

const debug = require("debug")("transform:utils");

export const addAwaitKeyword = (p: ASTPath<CallExpression>, j: JSCodeshift) => {
  // debug('need add await', j(p).toSource(), p)
  if (p.parentPath?.value.type === "AwaitExpression") {
    debug("already has await expression");
    return;
  }
  const awaitNode = j.awaitExpression(p.value);
  debug(j(awaitNode).toSource());
  debug(j(p.value).toSource());
  j(p).replaceWith(awaitNode);
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
    ].includes(p.parentPath.value.type)
  ) {
    return p.parentPath;
  }

  if (p.parentPath) {
    return findParentFunction(p.parentPath);
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

export const setFunctionAsync = (p: ASTPath) => {
  if (
    p.value.type === "ArrowFunctionExpression" ||
    p.value.type === "FunctionDeclaration" ||
    p.value.type === "FunctionExpression" ||
    p.value.type === "ObjectMethod"
  ) {
    debug("set function async", p.value.loc?.start);
    p.value.async = true;
  }
};

export const setFunctionNotAsync = (p: ASTPath) => {
  if (
    p.value.type === "ArrowFunctionExpression" ||
    p.value.type === "FunctionDeclaration" ||
    p.value.type === "FunctionExpression" ||
    p.value.type === "ObjectMethod"
  ) {
    debug("set function async", p.value.loc?.start);
    p.value.async = false;
  }
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
  collection
    .find(j.CallExpression, {})
    .filter(
      (p2) =>
        p2.value.callee.type === "Identifier" && p2.value.callee.name === name
    )
    .map((p3) => {
      addAwaitKeyword(p3, j);
      const parentFunctionPath = findParentFunction(p3);
      // debug("parent function path", parentFunctionPath?.value);
      if (parentFunctionPath) {
        setFunctionAsync(parentFunctionPath);
      }
      return null;
    });
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
        addAwaitKeyword(p, j);
        const parentFunctionPath = findParentFunction(p);
        // debug("parent function path", parentFunctionPath?.value);
        if (parentFunctionPath) {
          setFunctionAsync(parentFunctionPath);
        }
      }
    }
    return null;
  });
};

export const getFunctionLocation = (p: ASTPath) => {
  switch (p.value.type) {
    case "ArrowFunctionExpression":
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ObjectMethod":
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
