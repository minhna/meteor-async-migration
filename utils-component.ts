import {
  ASTPath,
  BlockStatement,
  JSCodeshift,
  JSXElement,
  Options,
  Pattern,
} from "jscodeshift";
import { ExpressionKind } from "ast-types/gen/kinds";
import fs from "fs";

import {
  convertAllCallExpressionToAsync,
  findImportNodeByVariableName,
  findVariableDeclarator,
  getFileContent,
  getRealImportSource,
} from "./utils";
const tsParser = require("jscodeshift/parser/ts");

const debug = require("debug")("transform:utils-component");
const debug2 = require("debug")("transform:print:utils-component");

export const getComponentName = (p: ASTPath<JSXElement>) => {
  debug("_BEGIN getComponentName:");
  debug(p.value.openingElement.name);
  const { name } = p.value.openingElement;
  switch (name.type) {
    case "JSXIdentifier":
      return name.name;
  }

  debug("_END getComponentName:");
};

export type ComponentPropsType = { [key: string]: any };

export const getComponentProps = (
  p: ASTPath<JSXElement>,
  j: JSCodeshift,
  parentComponentProps?: ComponentPropsType
) => {
  debug("_BEGIN getComponentProps");

  const { attributes } = p.value.openingElement;
  debug("_attributes", attributes);

  let props: ComponentPropsType = {};

  attributes?.map((att) => {
    switch (att.type) {
      case "JSXAttribute": {
        // get the prop name:
        let propName = "";
        switch (att.name.type) {
          case "JSXIdentifier":
            propName = att.name.name;
            break;
        }

        if (!propName) {
          debug("__No prop name found");
          break;
        }

        if (!att.value) {
          // e.g: <SomeComponent isActive />
          props[propName] = true;
        } else {
          switch (att.value.type) {
            case "JSXExpressionContainer": {
              // e.g: <Component someProp={someVar} />
              debug("___att.value.expression", att.value.expression);
              const { expression } = att.value;
              switch (expression.type) {
                case "Identifier": {
                  // e.g: <Component someProp={someVar} />
                  debug("____attribute variable name:", expression.name);
                  // now find the variable, check if it was async function
                  // first, find in parent component props
                  if (
                    parentComponentProps &&
                    parentComponentProps[expression.name]
                  ) {
                    debug(
                      "____found in parent component props:",
                      parentComponentProps[expression.name]
                    );
                    props[propName] = parentComponentProps[expression.name];
                  } else {
                    const variable = findVariableDeclarator(
                      expression.name,
                      p,
                      j
                    );
                    debug("____attribute variable:", variable);
                    if (variable) {
                      props[propName] = variable.value.init;
                    }
                  }

                  break;
                }
                case "ObjectExpression": {
                  // e.g: <FirstContext.Provider value={{ cas1, cas2 }}>
                  const propValue = {};
                  expression.properties.map((xp) => {
                    switch (xp.type) {
                      case "ObjectProperty": {
                        if (xp.key.type === "Identifier") {
                          switch (xp.value.type) {
                            case "Identifier": {
                              const variable = findVariableDeclarator(
                                xp.value.name,
                                p,
                                j
                              );
                              debug("____ObjectProperty variable:", variable);
                              if (variable) {
                                propValue[xp.key.name] = variable.value.init;
                              }

                              break;
                            }
                            case "ArrowFunctionExpression":
                            // e.g: <Component value={{ cas1, cas2: () => {} }} />
                            case "FunctionExpression":
                              // e.g: <Component value={{ cas1, cas2: function() {} }} />
                              propValue[xp.key.name] = xp.value;
                              break;
                            default:
                              debug(
                                "__Unhandled ObjectProperty value type:",
                                xp.value.type
                              );
                          }
                        }
                        break;
                      }
                      default:
                        debug(
                          "____Unhandled expression property type:",
                          xp.type
                        );
                    }
                  });
                  props[propName] = propValue;
                  break;
                }
                case "ArrowFunctionExpression":
                // e.g: <Component someProp={() => {})} />
                case "FunctionExpression":
                  // e.g: <Component someProp={function () {}} />
                  props[propName] = expression;
                  break;
                default:
                  debug("__Unhandled attribute value type:", att.value.type);
              }

              break;
            }
            case "StringLiteral": {
              // e.g: <Component myProp="My value" />
              props[propName] = att.value;

              break;
            }
          }
        }
        break;
      }
      case "JSXSpreadAttribute": {
        // e.g: {...props}
        debug("__JSXSpreadAttribute", att);
        switch (att.argument.type) {
          case "Identifier": {
            // e.g: {...props}
            // first, find in the parent component props
            if (
              parentComponentProps &&
              parentComponentProps[att.argument.name]
            ) {
              debug(
                "____found in parent component props:",
                parentComponentProps[att.argument.name]
              );
              props = { ...props, ...parentComponentProps[att.argument.name] };

              break;
            }

            const bigProps = findVariableDeclarator(att.argument.name, p, j);

            if (bigProps) {
              debug("___found spread attribute variable:", bigProps);
              switch (bigProps.value.type) {
                case "VariableDeclarator": {
                  // e.g: const props = { v: "V" }
                  debug("____variable declarator init:", bigProps.value.init);
                  switch (bigProps.value.init?.type) {
                    case "ObjectExpression": {
                      const { properties } = bigProps.value.init;
                      debug("_____Object expression properties:", properties);
                      properties.forEach((pr) => {
                        if (pr.type === "ObjectProperty") {
                          // get the property name
                          let prName = "";
                          switch (pr.key.type) {
                            case "Identifier":
                              prName = pr.key.name;
                              break;
                          }

                          if (prName && pr.value) {
                            props[prName] = pr.value;
                          }
                        }
                      });
                      break;
                    }
                  }

                  break;
                }
              }
            } else {
              // e.g: <DocumentsUpload {...props}>
              props = { ...props, ...parentComponentProps };
            }
            break;
          }
        }

        break;
      }
    }
  });

  debug("_END getComponentProps");

  return props;
};

/**
 * Work with component definition
 * 1. find all async function from props
 * 2. find all usages of those async function
 * 3. add await/async expression
 * 4. find and return all child components with name, props and file location
 * 5. call handleComponent with those components
 */
interface HandleComponent {
  componentName: string;
  filePath: string;
  props: ComponentPropsType;
  j: JSCodeshift;
  options: Options;
  importSpecType?: String;
}
export const handleComponent = ({
  componentName,
  filePath,
  props,
  j,
  options,
  importSpecType,
}: HandleComponent) => {
  debug("[handleComponent] BEGIN:", componentName, filePath);

  const { content: fileContent, realPath } = getFileContent(filePath);
  // debug("content\n", fileContent);

  if (!fileContent || !realPath) {
    debug("[handleComponent] file content was not found");
    return;
  }

  const componentRootCollection = j(fileContent, { parser: tsParser });
  let componentFileChanged = false;

  // find the component definition by name
  let componentParams: Pattern[] | undefined;
  let componentPath: ASTPath | undefined;
  let componentBody: BlockStatement | ExpressionKind | undefined;

  let realComponentName = componentName;

  // DEFAULT EXPORT, NAME CAN BE DIFFERENT
  if (importSpecType === "ImportDefaultSpecifier") {
    // find the default export
    componentRootCollection.find(j.ExportDefaultDeclaration).map((xp) => {
      if (xp.value.declaration.type === "Identifier") {
        realComponentName = xp.value.declaration.name;
        debug("[handleComponent] real component name:", realComponentName);
      }
      return null;
    });
  }

  // first, find by variable name
  componentRootCollection
    .findVariableDeclarators(realComponentName)
    .map((p) => {
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
      if (p.value.id?.name === realComponentName) {
        debug("[handleComponent] function found at:", p.value.id.loc?.start);
        componentParams = p.value.params;
        componentPath = p;
        componentBody = p.value.body;
      }
      return null;
    });
  }

  debug("[handleComponent] componentParams", componentParams);
  // debug("[handleComponent] componentBody", componentBody);

  if (!componentPath) {
    return;
  }

  // TODO: works with react context
  let contextProps: ComponentPropsType | undefined;
  // find all useContext call
  j(componentPath)
    .find(j.CallExpression)
    .map((p) => {
      // debug("[handleComponent] _finding useContext:", p.value);
      let contextName: string | undefined;
      switch (p.value.callee.type) {
        case "MemberExpression": {
          if (
            p.value.callee.property.type === "Identifier" &&
            p.value.callee.property.name === "useContext"
          ) {
            debug("[handleComponent] _found useContext:", p.value.loc?.start);
            // debug("[handleComponent]", p.value);
            if (p.value.arguments[0].type === "Identifier") {
              contextName = p.value.arguments[0].name;
            }
          }
          break;
        }
        case "Identifier": {
          if (p.value.callee.name === "useContext") {
            debug("[handleComponent] _found useContext:", p.value.loc?.start);
            // debug("[handleComponent]", p.value);
            if (p.value.arguments[0].type === "Identifier") {
              contextName = p.value.arguments[0].name;
            }
          }
          break;
        }
      }
      if (!contextName) {
        return null;
      }

      debug("[handleComponent] _context name:", contextName);
      debug("[handleComponent] _context usage parent path:", p.parentPath);
      const extractedContextVariables: { [key: string]: string } = {};
      if (p.parentPath.value.type === "VariableDeclarator") {
        if (p.parentPath.value.id.type === "ObjectPattern") {
          debug(
            "[handleComponent] _properties",
            p.parentPath.value.id.properties
          );
          p.parentPath.value.id.properties.map((property) => {
            if (property.type === "ObjectProperty") {
              if (
                property.key.type === "Identifier" &&
                property.value.type === "Identifier"
              ) {
                extractedContextVariables[property.value.name] =
                  property.key.name;
              }
            }
          });
        }
      }
      debug(
        `[handleComponent] extractedContextVariables from context ${contextName}:`,
        extractedContextVariables
      );
      if (Object.keys(extractedContextVariables).length === 0) {
        return null;
      }

      // now find the imported context
      const { importSource, importSpecType } = findImportNodeByVariableName(
        contextName,
        componentRootCollection,
        j
      );
      debug("_import from source:", importSource);
      if (!importSource) {
        debug("no imported source found");
        return null;
      }
      if (/^[^./]/.test(importSource)) {
        debug("It looks like a library:", importSource);
        return null;
      }
      const realImportSource = getRealImportSource(importSource, realPath);

      // read the context source
      const providerProps = getContextVariables({
        contextName,
        filePath: realImportSource,
        j,
        importSpecType,
      });

      if (providerProps && providerProps.value) {
        contextProps = providerProps.value;
      }

      return null;
    });

  const allProps = { ...props, ...contextProps };

  // works with component's params
  if (componentParams && componentParams.length > 0) {
    // find in props all async function
    Object.keys(allProps).map((propKey) => {
      if (!allProps[propKey]) {
        return;
      }
      const propValue = allProps[propKey].value
        ? allProps[propKey].value
        : allProps[propKey];
      // debug("prop Key", propKey);
      // debug("prop Value", propValue);
      if (
        ["FunctionExpression", "ArrowFunctionExpression"].includes(
          propValue.type
        )
      ) {
        if (propValue.async && componentPath) {
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
    debug2("[handleComponent] new source for this file:", realPath);
    debug(
      "[handleComponent] new source:",
      realPath,
      componentRootCollection.toSource()
    );

    if (!options.dry) {
      //write file
      fs.writeFileSync(realPath, componentRootCollection.toSource());
      debug2("[handleComponent] file changed:", realPath);
    }
  }

  // Work with child components
  if (componentPath) {
    debug(
      "[handleComponent] _Work with child components of:",
      realComponentName
    );
    const elements = j(componentPath).find(j.JSXElement).paths();
    for (let i = 0; i < elements.length; i += 1) {
      const p = elements[i];
      debug("[handleComponent] _jsx element", p.value.loc?.start);

      const childComponentName = getComponentName(p);
      // debug("_component name:", childComponentName);

      // component name must start with a capital letter.
      if (!childComponentName || !/^[A-Z]/.test(childComponentName)) {
        debug("[handleComponent] _not a react component, continue");
        continue;
      }

      debug("[handleComponent] _child component name:", childComponentName);

      const childProps = getComponentProps(p, j, allProps);
      debug(
        `[handleComponent] _child component ${childComponentName} props:`,
        childProps
      );

      // find the component declaration
      let theComponent = findVariableDeclarator(childComponentName, p, j);
      if (theComponent) {
        debug(
          "[handleComponent] _child component at:",
          theComponent?.value.loc.start
        );
        handleComponent({
          componentName: childComponentName,
          filePath: realPath,
          props: childProps,
          j,
          options,
        });
      }

      if (!theComponent) {
        // find the component from import declarations
        const { importSource, importSpecType } = findImportNodeByVariableName(
          childComponentName,
          componentRootCollection,
          j
        );
        if (importSource) {
          // debug("_import from source:", importSource);
          if (/^[^./]/.test(importSource)) {
            debug("It looks like a library:", importSource);
          } else {
            const realImportSource = getRealImportSource(
              importSource,
              realPath
            );
            debug(
              "[handleComponent] _child imported component:",
              realImportSource
            );
            handleComponent({
              componentName: childComponentName,
              filePath: realImportSource,
              props: childProps,
              j,
              options,
              importSpecType,
            });
          }
        }
      }
    }
  }

  debug("[handleComponent] END:", componentName, filePath);
};

interface GetContextVariables {
  contextName: string;
  filePath: string;
  j: JSCodeshift;
  importSpecType?: String;
}
export const getContextVariables = ({
  contextName,
  filePath,
  j,
  importSpecType,
}: GetContextVariables) => {
  // read the context file
  const { content: fileContent, realPath } = getFileContent(filePath);
  // debug("content\n", fileContent);

  if (!fileContent || !realPath) {
    debug("[getContextVariables] file content was not found");
    return;
  }
  const contextRootCollection = j(fileContent, { parser: tsParser });
  // find the context declaration
  let theRealContextName = contextName;
  if (importSpecType === "ImportDefaultSpecifier") {
    // find the default export
    contextRootCollection.find(j.ExportDefaultDeclaration).map((xp) => {
      if (xp.value.declaration.type === "Identifier") {
        theRealContextName = xp.value.declaration.name;
        debug("[getContextVariables] real context name:", theRealContextName);
      }
      return null;
    });
  }

  let vars: ComponentPropsType = {};

  // find the context provider
  contextRootCollection.find(j.JSXElement).map((jsx) => {
    debug("[getContextVariables] jsx", jsx.value.openingElement);
    if (jsx.value.openingElement.name.type === "JSXMemberExpression") {
      const { object, property } = jsx.value.openingElement.name;
      if (
        object.type === "JSXIdentifier" &&
        object.name === theRealContextName &&
        property.type === "JSXIdentifier" &&
        property.name === "Provider"
      ) {
        // get the variables from attributes
        const providerProps = getComponentProps(jsx, j);
        debug("[getContextVariables] Found provider props:", providerProps);
        if (providerProps.value) {
          vars = providerProps;
        }
      }
    }

    return null;
  });

  debug("[getContextVariables] context variables:", vars);

  return vars;
};
