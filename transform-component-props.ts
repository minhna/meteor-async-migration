/**
 * 1. Find all react components
 * 2. Find all component props
 * 3. Check if prop variable was async function
 * 4. Find in component's children, all async function props usages
 * 4.1. Add async/await to all usages
 * 5. Find in component's children, other component
 * 5.1 Each component, check if props variable was async function (goto 3)
 */

import { FileInfo, API, Options } from "jscodeshift";

const debug = require("debug")("transform:component-props");
const debug2 = require("debug")("transform:print:component-props");

import {
  findImportNodeByVariableName,
  findVariableDeclarator,
  getRealImportSource,
} from "./utils";
import {
  getComponentName,
  getComponentProps,
  handleComponent,
} from "./utils-component";

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `\n**************************************************
 *** ${fileInfo.path}
 **************************************************\n`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);

  // find all react elements
  const elements = rootCollection.find(j.JSXElement).paths();
  // debug(elements);
  // must use this for loop because we don't want a file being opened at the same time.
  for (let i = 0; i < elements.length; i += 1) {
    const p = elements[i];
    debug("_jsx element", p.value.loc?.start);

    const componentName = getComponentName(p);
    // debug("_component name:", componentName);

    // component name must start with a capital letter.
    if (!componentName || !/^[A-Z]/.test(componentName)) {
      continue;
    }

    const props = getComponentProps(p, j);
    // debug("_props:", props);

    debug("_component name:", componentName);
    // debug("_props:", props);

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
        // check if not from local file
        if (/^[^./]/.test(importSource)) {
          debug("It looks like a library:", importSource);
        } else {
          // debug("_import from source:", importSource);
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
  }

  if (fileChanged) {
    debug2("file changed: ", fileInfo.path);
    return rootCollection.toSource();
  }
};
