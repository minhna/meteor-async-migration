/**
 * 1. Find all withTracker calls
 * 2. Find all component props
 * 3. Check if prop variable was async function
 * 4. Find in component's children, all async function props usages
 * 4.1. Add async/await to all usages
 * 5. Find in component's children, other component
 * 5.1 Each component, check if props variable was async function (goto 3)
 */

import { FileInfo, API, Options } from "jscodeshift";

const debug = require("debug")("transform:component-props-withTracker");
const debug2 = require("debug")("transform:print:component-props-withTracker");

import {
  findImportNodeByVariableName,
  findVariableDeclarator,
  getRealImportSource,
} from "./utils";
import { ComponentPropsType, handleComponent } from "./utils-component";

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `\n**************************************************
 *** ${fileInfo.path}
 **************************************************\n`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);

  // work with withTracker functions
  const withTrackerCalls = rootCollection
    .find(j.CallExpression)
    .filter((p) => {
      // debug("call expression", p.value.loc?.start);
      if (p.value.callee.type === "Identifier") {
        if (p.value.callee.name === "withTracker") {
          return true;
        }
      }
      return false;
    })
    .paths();
  // debug("withTrackerCalls", withTrackerCalls);
  // must use this for loop because we don't want a file being opened at the same time.
  for (let i = 0; i < withTrackerCalls.length; i += 1) {
    const p = withTrackerCalls[i];
    if (p.parentPath.value.type !== "CallExpression") {
      continue;
    }
    const componentName = p.parentPath.value.arguments[0].name;
    debug("component name", componentName);

    if (!componentName) {
      continue;
    }

    // get the props
    // debug(p.value.arguments[0]);
    // find in this block, ReturnStatement
    const props: ComponentPropsType = {};
    j(p.value.arguments)
      .find(j.ReturnStatement)
      .forEach((rp) => {
        // debug("return statement", rp.value.argument);
        switch (rp.value.argument?.type) {
          case "ObjectExpression":
            rp.value.argument.properties.map((item) => {
              switch (item.type) {
                case "ObjectProperty": {
                  // debug("property key", item.key);
                  // debug("property value", item.value);
                  switch (item.key.type) {
                    case "Identifier": {
                      switch (item.value.type) {
                        case "Identifier": {
                          // e.g: as1: async1,
                          // find the variable
                          const v = findVariableDeclarator(
                            item.value.name,
                            p,
                            j
                          );
                          if (v) {
                            props[item.key.name] = v.value.init;
                          }
                          break;
                        }
                        case "ArrowFunctionExpression":
                        case "FunctionExpression":
                          props[item.key.name] = item.value;
                          break;
                        default:
                          debug(
                            "Unhandled property value type:",
                            item.value.type
                          );
                      }
                      break;
                    }
                  }

                  break;
                }
                case "SpreadElement": {
                  // e.g: ...aVariable
                  // debug("SpreadElement", item.argument);
                  if (item.argument.type === "Identifier") {
                    // find the variable
                    // debug("find variable name:", item.argument.name);
                    const v = findVariableDeclarator(item.argument.name, p, j);
                    if (v) {
                      // debug("found spread variable", v.value.init);
                      switch (v.value.init.type) {
                        case "ObjectExpression":
                          v.value.init.properties.map((sp) => {
                            props[sp.key.name] = sp.value;
                          });
                          break;
                      }
                    }
                  }
                  break;
                }
                default:
                  debug("Unhandled argument property type:", item.type);
              }
            });
            break;
          default:
            debug("Unhandled return statement type:", rp.value.argument?.type);
        }
      });
    debug("props", props);

    // find the component declaration
    let theComponent = findVariableDeclarator(componentName, p, j);
    if (theComponent) {
      // debug("_component:", theComponent?.value);
      handleComponent({
        componentName,
        filePath: fileInfo.path,
        props,
        j,
        options,
      });
    }

    if (!theComponent) {
      // find the component from import declarations
      const { importSource, importSpecType } = findImportNodeByVariableName(
        componentName,
        rootCollection,
        j
      );
      if (importSource) {
        debug(`_import ${importSpecType} from source: ${importSource}`);
        const realImportSource = getRealImportSource(
          importSource,
          fileInfo.path
        );
        handleComponent({
          componentName,
          filePath: realImportSource,
          props,
          j,
          options,
          importSpecType,
        });
      }
    }
  }

  if (fileChanged) {
    debug2("file changed: ", fileInfo.path);
    return rootCollection.toSource();
  }
};
