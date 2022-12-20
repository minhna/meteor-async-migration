/**
 * Find all codes like Promise.all(SOME_VAR.forEach())
 * It won't modify your file
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

const debug = require("debug")("transform:find-promise-all-foreach");

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  //   debug(
  //     `**************************************************
  // *** ${fileInfo.path}
  // **************************************************`
  //   );

  const rootCollection = j(fileInfo.source);
  // debug(rootCollection)

  // find all Promise.all() call
  rootCollection.find(j.CallExpression).map((p) => {
    // debug(j(p).toSource(), p.value.callee);
    if (p.value.callee.type === "MemberExpression") {
      const { object, property } = p.value.callee;
      if (
        p.value.callee.type === "MemberExpression" &&
        object.type === "Identifier" &&
        object.name === "Promise" &&
        property.type === "Identifier" &&
        property.name === "all"
      ) {
        // debug("child", p.value.arguments);
        if (
          p.value.arguments[0] &&
          p.value.arguments[0].type === "CallExpression"
        ) {
          if (p.value.arguments[0].callee.type === "MemberExpression") {
            const { property: cProperty } = p.value.arguments[0].callee;
            // debug(cProperty);
            if (
              cProperty.type === "Identifier" &&
              cProperty.name === "forEach"
            ) {
              // found
              debug(fileInfo.path);
              debug("!!!FOUND", cProperty.loc?.start);
              // debug(j(p).toSource());
            }
          }
        }
      }
    }
    return null;
  });

  return undefined;
};
