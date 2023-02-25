/**
 * Convert Meteor.call() to Meteor.callAsync()
 */

import { FileInfo, API, Options } from "jscodeshift";

import { addAwaitKeyword, findParentFunction, setFunctionAsync } from "./utils";

const debug = require("debug")("transform:meteor-call");
const debug2 = require("debug")("transform:print:meteor-call");

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `**************************************************
*** ${fileInfo.path}
**************************************************`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);
  // debug(rootCollection)

  // find all Meteor.call() expression
  rootCollection.find(j.CallExpression).forEach((p) => {
    if (
      p.value.type === "CallExpression" &&
      p.value.callee.type === "MemberExpression" &&
      p.value.callee.object.type === "Identifier" &&
      p.value.callee.object.name === "Meteor" &&
      p.value.callee.property.type === "Identifier" &&
      p.value.callee.property.name === "call"
    ) {
      debug("Meteor call:", p.value.loc?.start);
      const { arguments: args } = p.value;
      // debug("arguments", args);
      // get the last arg
      const lastArg = args[args.length - 1];
      debug("last arg", lastArg);
      if (
        !["FunctionExpression", "ArrowFunctionExpression"].includes(
          lastArg.type
        )
      ) {
        // it doesn't have callback.
        // check if it followed by .then expression
        // debug("parent", p.parentPath);
        if (
          p.parentPath.value.type === "MemberExpression" &&
          p.parentPath.value.property.type === "Identifier" &&
          p.parentPath.value.property.name === "then"
        ) {
          debug("handle promise by then()");
        } else {
          // we need to convert it to Meteor.callAsync()
          p.value.callee.property.name = "callAsync";
          debug("need add await", p);
          if (addAwaitKeyword(p, j)) {
            // set parent function async
            const parentFunction = findParentFunction(p);
            if (parentFunction) {
              setFunctionAsync(parentFunction, j);
            }

            fileChanged = true;
          }
        }
      }
    }
  });

  debug("**************************************************");

  if (fileChanged) {
    debug2("file changed:", fileInfo.path);
    return rootCollection.toSource();
  }
};
