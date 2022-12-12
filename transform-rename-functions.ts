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
} from "jscodeshift";
import {
  convertAllCallExpressionToAsync,
  findParentFunction,
  setFunctionAsync,
} from "./utils";

type MethodDescType = {
  type: string;
  objectName?: string;
  propertyName?: string;
  functionName?: string;
  await?: boolean;
};

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

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `**************************************************
*** ${fileInfo.path}
**************************************************`
  );
  const rootCollection = j(fileInfo.source);
  // debug(rootCollection)

  const getExpressionStatementFromString = (
    source: string
  ): ASTPath<ExpressionStatement> | undefined => {
    let sourceNode: ASTPath<ExpressionStatement> | undefined = undefined;
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
    toNode: ASTPath<ExpressionStatement>,
    args: CallExpression["arguments"]
  ) => {
    j(toNode)
      .find(j.CallExpression)
      .at(0)
      .map((tp) => {
        debug("++tp", tp);
        tp.value.arguments = args;
        return null;
      });
    debug("++modified toNode arguments", toNode);
    debug("++node to be replaced", p);
    // now update the code
    if (p.value.type === "CallExpression") {
      j(p).replaceWith(toNode.value);
    } else {
      j(p.parentPath).replaceWith(toNode.value);
    }
    // check if toNode is await expression
    if (toNode.value.expression.type === "AwaitExpression") {
      // find the parent function
      const parentFunctionPath = findParentFunction(p);
      if (parentFunctionPath) {
        setFunctionAsync(parentFunctionPath);
        // then find all functions which use this async function
        debug("++the parent", parentFunctionPath);
        switch (parentFunctionPath.value.type) {
          case "FunctionDeclaration":
            if (parentFunctionPath.value.id?.type === "Identifier") {
              convertAllCallExpressionToAsync(
                parentFunctionPath.value.id?.name,
                rootCollection,
                j
              );
            }
            break;
          default:
            debug(
              "+++Unhandled parent function type:",
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
    debug("fromNode value expression", fromNode?.value.expression);
    debug("toNode value expression", toNode?.value.expression);

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
            debug("+fromNode.value.expression.callee.name", calleeName);
            rootCollection.find(j.CallExpression).map((p) => {
              if (
                p.value.callee?.type === "Identifier" &&
                calleeName === p.value.callee.name
              ) {
                debug("++found", p);
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
                debug("++found 2", p.parentPath);
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

  return rootCollection.toSource();
};
