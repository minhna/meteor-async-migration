/**
 * 1. Find async functions
 * 2. Check if there is any await expression inside the function
 * 3. If there wasn't any await expression, then remove async from function expression.
 */

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
  FunctionExpression,
  Position,
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
  findParentFunction,
  getFunctionLocation,
  setFunctionNotAsync,
} from "./utils";

const debug = require("debug")("transform:fix-async-overly");
const debug2 = require("debug")("transform:print:fix-async-overly");

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `**************************************************
*** ${fileInfo.path}
**************************************************`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);
  // debug(rootCollection)

  const checkIfAsyncNeeded = (p: ASTPath) => {
    debug("check", j(p).toSource());

    // get the function location
    const { start, end } = getFunctionLocation(p) || {};

    debug({ start, end });

    // find await expression
    const subCollection = j(p);
    let foundAwait = false;
    subCollection.find(j.AwaitExpression).map((p2) => {
      // find the parent function
      const myParentFunction = findParentFunction(p2);
      if (myParentFunction) {
        // check if p2 is p
        const { start: start2, end: end2 } =
          getFunctionLocation(myParentFunction) || {};
        debug({ start2, end2 });
        if (start2?.line === start?.line && start2?.column === start?.column) {
          foundAwait = true;
        }
      }
      return null;
    });
    debug("found await:", foundAwait);
    if (!foundAwait) {
      // remove async from function expression
      if (setFunctionNotAsync(p)) {
        fileChanged = true;
      }
    }
  };

  // find all async expression
  rootCollection.find(j.ArrowFunctionExpression).map((p) => {
    if (p.value.async) {
      checkIfAsyncNeeded(p);
    }
    return null;
  });
  rootCollection.find(j.FunctionDeclaration).map((p) => {
    if (p.value.async) {
      checkIfAsyncNeeded(p);
    }
    return null;
  });
  rootCollection.find(j.FunctionExpression).map((p) => {
    if (p.value.async) {
      checkIfAsyncNeeded(p);
    }
    return null;
  });
  rootCollection.find(j.ObjectMethod).map((p) => {
    if (p.value.async) {
      checkIfAsyncNeeded(p);
    }
    return null;
  });
  rootCollection.find(j.ClassMethod).map((p) => {
    if (p.value.async) {
      checkIfAsyncNeeded(p);
    }
    return null;
  });

  debug("**************************************************");

  if (fileChanged) {
    debug2("file changed:", fileInfo.path);
    return rootCollection.toSource();
  }
};
