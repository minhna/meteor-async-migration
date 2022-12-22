/**
 * 1. Find all react components
 * 2. Find all component props
 * 3. Check if prop variable was async function
 * 4. Find in component's children, all async function props usages
 * 4.1. Add async/await to all usages
 * 5. Find in component's children, other component
 * 5.1 Each component, check if props variable was async function (goto 3)
 */

import fs from "fs";
6;

import { FileInfo, API, Options, ASTPath, JSXElement } from "jscodeshift";

const debug = require("debug")("transform:component-props");
const debug2 = require("debug")("transform:print:component-props");

import {
  convertAllCallExpressionToAsync,
  convertAllMemberExpressionCallToAsync,
  findParentObject,
  findVariableDeclarator,
  getComponentName,
  getComponentProps,
} from "./utils";

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `\n**************************************************
 *** ${fileInfo.path}
 **************************************************\n`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);

  const handleJSXElement = () => {};

  // find all react elements
  rootCollection.find(j.JSXElement).map((p) => {
    debug("_jsx element", p.value.loc?.start);

    const props = getComponentProps(p, j);
    debug("props:", props);

    const componentName = getComponentName(p);
    debug("component name:", componentName);

    // component name must start with a capital letter.
    if (!componentName || !/^[A-Z]/.test(componentName)) {
      return null;
    }

    // find the component declaration
    const theComponent = findVariableDeclarator(componentName, p, j);
    debug("component:", theComponent?.value);

    return null;
  });

  if (fileChanged) {
    debug2("file changed: ", fileInfo.path);
    return rootCollection.toSource();
  }
};
