/**
 * Find all codes like Promise.all(SOME_VAR.forEach())
 * It won't modify your file
 */

import { FileInfo, API, Options } from "jscodeshift";

const debug = require("debug")("transform:find-promise-all-foreach");
const debug2 = require("debug")("transform:print:find-promise-all-foreach");

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `**************************************************
  *** ${fileInfo.path}
  **************************************************`
  );

  const rootCollection = j(fileInfo.source);
  // debug(rootCollection)

  // find all Promise.all() call
  rootCollection.find(j.CallExpression).map((p) => {
    debug(j(p).toSource(), p.value.callee);
    if (p.value.callee.type === "MemberExpression") {
      const { object, property } = p.value.callee;
      if (
        p.value.callee.type === "MemberExpression" &&
        object.type === "Identifier" &&
        object.name === "Promise" &&
        property.type === "Identifier" &&
        property.name === "all"
      ) {
        debug("child", p.value.arguments);
        if (
          p.value.arguments[0] &&
          p.value.arguments[0].type === "CallExpression"
        ) {
          if (p.value.arguments[0].callee.type === "MemberExpression") {
            const { property: cProperty } = p.value.arguments[0].callee;
            debug(cProperty);
            if (
              cProperty.type === "Identifier" &&
              cProperty.name === "forEach"
            ) {
              // found
              debug(fileInfo.path);
              debug2("!!!FOUND", cProperty.loc?.start);
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
