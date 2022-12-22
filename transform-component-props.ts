/**
 * 1. Find all react components
 * 2. Find all component props
 * 3. Check if prop variable was async function
 * 4. Find in component's children, all async function props usages
 * 4.1. Add async/await to all usages
 * 5. Find in component's children, other component
 * 5.1 Each component, check if props variable was async function (goto 3)
 */

import { ExpressionKind } from "ast-types/gen/kinds";
import {
  FileInfo,
  API,
  Options,
  ASTPath,
  BlockStatement,
  Pattern,
} from "jscodeshift";
import fs from "fs";

const tsParser = require("jscodeshift/parser/ts");

const debug = require("debug")("transform:component-props");
const debug2 = require("debug")("transform:print:component-props");

import {
  convertAllCallExpressionToAsync,
  findImportNodeByVariableName,
  findVariableDeclarator,
  getComponentName,
  getComponentProps,
  getFileContent,
  getRealImportSource,
} from "./utils";

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `\n**************************************************
 *** ${fileInfo.path}
 **************************************************\n`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);

  /**
   * Work with component definition
   * 1. find all async function from props
   * 2. find all usages of those async function
   * 3. add await/async expression
   * 4. find and return all child components with name, props and file location
   * 5. call handleComponent with those components
   */
  const handleComponent = (
    componentName: string,
    filePath: string,
    props: { [key: string]: any }
  ) => {
    debug("[handleComponent] BEGIN:", componentName, filePath);
    // TODO: works with react context

    const { content: fileContent, realPath } = getFileContent(filePath);
    // debug("content\n", fileContent);

    if (!fileContent || !realPath) {
      debug("[handleComponent] file content was not found");
      return false;
    }

    const componentRootCollection = j(fileContent, { parser: tsParser });
    let componentFileChanged = false;

    // find the component definition by name
    let componentParams: Pattern[] | undefined;
    let componentPath: ASTPath;
    let componentBody: BlockStatement | ExpressionKind | undefined;
    // first, find by variable name
    componentRootCollection.findVariableDeclarators(componentName).map((p) => {
      debug("[handleComponent] variable found at:", p.value.loc?.start);
      switch (p.value.init?.type) {
        case "ArrowFunctionExpression":
        case "FunctionExpression":
          componentParams = p.value.init.params;
          componentPath = p;
          componentBody = p.value.init.body;
          break;

        default:
          debug(
            "[handleComponent] Unhandled variable init type:",
            p.value.init?.type
          );
      }
      return null;
    });
    if (!componentBody) {
      componentRootCollection.find(j.FunctionDeclaration).map((p) => {
        if (p.value.id?.name === componentName) {
          debug("[handleComponent] function found at:", p.value.id.loc?.start);
          componentParams = p.value.params;
          componentPath = p;
          componentBody = p.value.body;
        }
        return null;
      });
    }

    // debug("[handleComponent] componentParams", componentParams);
    // debug("[handleComponent] componentBody", componentBody);

    if (componentParams && componentParams.length > 0) {
      // find in props all async function
      Object.keys(props).map((propKey) => {
        const propValue = props[propKey].value
          ? props[propKey].value
          : props[propKey];
        // debug("prop Key", propKey);
        // debug("prop Value", propValue);
        if (
          ["FunctionExpression", "ArrowFunctionExpression"].includes(
            propValue.type
          )
        ) {
          if (propValue.async) {
            debug("[handleComponent] Async function prop:", propKey);
            // convert all usages of this function to async/await
            if (convertAllCallExpressionToAsync(propKey, j(componentPath), j)) {
              componentFileChanged = true;
            }
          }
        }
      });
    }

    if (componentFileChanged) {
      debug("new source:", componentRootCollection.toSource());

      if (!options.dry) {
        //write file
        fs.writeFileSync(realPath, componentRootCollection.toSource());
        debug2("file changed:", realPath);
      }
    }

    debug("[handleComponent] END:", componentName, filePath);
  };

  // find all react elements
  const elements = rootCollection.find(j.JSXElement).paths();
  // debug(elements);
  // must use this for loop because we don't want a file being opened at the same time.
  for (let i = 0; i < elements.length; i += 1) {
    const p = elements[i];
    debug("_jsx element", p.value.loc?.start);

    const props = getComponentProps(p, j);
    // debug("_props:", props);

    const componentName = getComponentName(p);
    // debug("_component name:", componentName);

    // component name must start with a capital letter.
    if (!componentName || !/^[A-Z]/.test(componentName)) {
      continue;
    }

    debug("_component name:", componentName);
    // debug("_props:", props);

    // find the component declaration
    let theComponent = findVariableDeclarator(componentName, p, j);
    if (theComponent) {
      // debug("_component:", theComponent?.value);
      handleComponent(componentName, fileInfo.path, props);
    }

    if (!theComponent) {
      // find the component from import declarations
      const importNode = findImportNodeByVariableName(
        componentName,
        rootCollection,
        j
      );
      if (importNode) {
        // debug("_import node:", importNode);
        if (importNode.source.type === "StringLiteral") {
          const realImportSource = getRealImportSource(
            importNode.source.value,
            fileInfo.path
          );
          handleComponent(componentName, realImportSource, props);
        }
      }
    }
  }

  if (fileChanged) {
    debug2("file changed: ", fileInfo.path);
    return rootCollection.toSource();
  }
};
