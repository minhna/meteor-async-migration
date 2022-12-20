/**
 * Find all await expression but not inside an async function
 * It won't modify your file
 */

import { FileInfo, API, Options } from "jscodeshift";
import { findParentFunction } from "./utils";

const debug = require("debug")("transform:find-await-without-async");
const debug2 = require("debug")("transform:print:find-await-without-async");

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `**************************************************
  *** ${fileInfo.path}
  **************************************************`
  );

  const rootCollection = j(fileInfo.source);
  // debug(rootCollection)

  // find all await expression
  rootCollection.find(j.AwaitExpression).map((p) => {
    debug(j(p).toSource());
    // try to get the parent function
    const parentFunction = findParentFunction(p);
    if (!parentFunction) {
      debug2("Found:", fileInfo.path, p.value.loc?.start);
      return null;
    }
    switch (parentFunction.value.type) {
      case "ArrowFunctionExpression":
      case "FunctionExpression":
      case "FunctionDeclaration":
      case "ObjectMethod":
      case "ClassMethod":
        if (!parentFunction.value.async) {
          debug(
            "parentFunction.value.type",
            parentFunction.value.type,
            parentFunction.value
          );
          debug2("Found 2:", fileInfo.path, p.value.loc?.start);
        }
        break;
      default:
        debug("Unhandled function type:", parentFunction.value.type);
    }

    return null;
  });

  return undefined;
};
