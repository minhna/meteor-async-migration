/**
 * Rename some function calls but keep the params
 * Currently it will find and replace once only.
 * You may need to run many times until it replace all the function.
 */

import {
  FileInfo,
  API,
  Options,
  ASTPath,
  CallExpression,
  ExpressionStatement,
} from "jscodeshift";

import * as recast from "recast";

import {
  convertAllCallExpressionToAsync,
  findParentFunction,
  setFunctionAsync,
} from "./utils";

type MethodsMappingItemType = {
  from: string;
  to: string;
};

const methodsMapping: MethodsMappingItemType[] = [
  {
    from: "Factory.create()",
    to: "await Factory.createAsync()",
  },
  // {
  //   from: "build()",
  //   to: "await buildAsync()",
  // },
  // {
  //   from: "create()",
  //   to: "await Factory.createAsync()",
  // },
];

const debug = require("debug")("transform:script-rename");
const debug2 = require("debug")("transform:print:script-rename");

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `**************************************************
*** ${fileInfo.path}
**************************************************`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);
  // debug(rootCollection)

  const MAX_REPLACEMENT = 1;
  let replaceCounter = 0;

  const getExpressionStatementFromString = (
    source: string
  ): ASTPath<ExpressionStatement> | undefined => {
    let sourceNode: ASTPath<ExpressionStatement> | undefined = undefined;
    try {
      const n = recast.parse(source).program.body[0];
      debug("***recast***", source, n);
      debug(j(n));
    } catch (e) {
      // debug("parse error", e);
    }
    j(source)
      .find(j.ExpressionStatement)
      .at(0)
      .map((item) => {
        sourceNode = item;
        return null;
      });
    // debug("sourceNode", sourceNode);
    return sourceNode;
  };

  const replaceFunction = (
    p: ASTPath<CallExpression>,
    byNode: ASTPath<ExpressionStatement>,
    args: CallExpression["arguments"]
  ) => {
    if (MAX_REPLACEMENT && replaceCounter >= MAX_REPLACEMENT) {
      return;
    }

    // debug("+++replace", j(p).toSource(), j(args).toSource());
    // debug("+++byNode before modified args", byNode, byNode.value.loc?.start);
    j(byNode)
      .find(j.CallExpression)
      .at(0)
      .map((tp) => {
        // debug("+++tp", tp);
        tp.value.arguments = args;
        return null;
      });
    // debug("+++modified byNode arguments", byNode, j(byNode).toSource());
    // now update the code
    let replaceThisPath;
    if (p.value.type === "CallExpression") {
      replaceThisPath = p;
    } else {
      replaceThisPath = p.parentPath;
    }
    debug(
      "\n+++replace this",
      j(replaceThisPath).toSource(),
      p.value.loc?.start,
      p.value.loc?.end
    );
    debug("+++by this", j(byNode.value).toSource());
    j(replaceThisPath).replaceWith(byNode.value);
    fileChanged = true;

    // increase the counter
    replaceCounter += 1;

    // check if byNode is await expression
    if (byNode.value.expression.type === "AwaitExpression") {
      // find the parent function
      const parentFunctionPath = findParentFunction(replaceThisPath);
      if (parentFunctionPath) {
        if (setFunctionAsync(parentFunctionPath)) {
          fileChanged = true;
        }
        // then find all functions which use this async function
        switch (parentFunctionPath.value.type) {
          case "FunctionDeclaration": {
            debug("+++the parent", parentFunctionPath.value?.id?.loc?.start);
            if (parentFunctionPath.value.id?.type === "Identifier") {
              if (
                convertAllCallExpressionToAsync(
                  parentFunctionPath.value.id?.name,
                  rootCollection,
                  j
                )
              ) {
                fileChanged = true;
              }
            }
            break;
          }
          default:
            debug(
              "++++Unhandled parent function type:",
              parentFunctionPath.value.type
            );
        }
      }
    }
  };

  // walk through methods mapping
  methodsMapping.map(({ from, to }) => {
    debug(`======= ${from} ==> ${to} =======`);
    const fromNode = getExpressionStatementFromString(from);
    const toNode = getExpressionStatementFromString(to);
    // debug("fromNode value expression", fromNode?.value.expression);
    // debug("toNode value expression", toNode?.value.expression);

    if (!fromNode || !toNode) {
      return null;
    }

    // find all the current expressions which match from code
    switch (fromNode.value.expression.type) {
      case "CallExpression": {
        // get the callee
        switch (fromNode.value.expression.callee.type) {
          case "Identifier": {
            // find all call expression with callee type is Identifier
            const calleeName = fromNode.value.expression.callee.name;
            // debug("+fromNode.value.expression.callee.name", calleeName);
            rootCollection.find(j.CallExpression).map((p) => {
              if (
                p.value.callee?.type === "Identifier" &&
                calleeName === p.value.callee.name
              ) {
                // debug("++found", p);
                replaceFunction(p, toNode, p.value.arguments);
              }
              return null;
            });
            break;
          }
          case "MemberExpression": {
            const { object, property } = fromNode.value.expression.callee;
            // debug("+callee", object, property);
            // find all member expression
            rootCollection.find(j.MemberExpression).map((p) => {
              if (
                p.value.object.type === "Identifier" &&
                p.value.property.type === "Identifier" &&
                p.value.object.type === object.type &&
                p.value.property.type === property.type &&
                p.value.object.name === object.name &&
                p.value.property.name === property.name
              ) {
                // debug("++found 2", p.parentPath);
                replaceFunction(
                  p.parentPath,
                  toNode,
                  p.parentPath.value.arguments
                );
              }

              return null;
            });
            break;
          }

          default:
            debug(
              `+Unhandled callee type: ${fromNode.value.expression.callee.type}`
            );
        }
        break;
      }
      default:
        debug(`Unhandled expression type: ${fromNode.value.expression.type}`);
    }
    debug(`==END== ${from} ==> ${to} ==END==`);
  });

  debug("**************************************************");

  if (fileChanged) {
    debug2("file changed:", fileInfo.path);
    return rootCollection.toSource();
  }
};
