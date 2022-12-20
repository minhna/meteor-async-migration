/**
 * 1. Find all async function declarations
 * 2. Find all these function calls
 * 3. Add await expression if needed.
 */

import fs from "fs";
6;

import {
  FileInfo,
  API,
  Options,
  ASTPath,
  CallExpression,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  AwaitExpression,
  Collection,
} from "jscodeshift";

const tsParser = require("jscodeshift/parser/ts");

const debug = require("debug")("transform:use-async-function");
const debug2 = require("debug")("transform:print:use-async-function");

import {
  addAwaitKeyword,
  convertAllCallExpressionToAsync,
  convertAllMemberExpressionCallToAsync,
  findParentFunction,
  findParentObject,
  setFunctionAsync,
} from "./utils";

const METEOR_ROOT_DIRECTORY = "/home/minhna/WORKS/Mike/settler/se2-admin";

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `\n**************************************************
*** ${fileInfo.path}
**************************************************\n`
  );
  let fileChanged = false;

  const rootCollection = j(fileInfo.source);

  const findVariableAssignments = (name: string) => {
    debug("Find variable declaration using this name:", name);

    rootCollection.find(j.VariableDeclaration).map((p) => {
      // debug("***VariableDeclaration", j(p).toSource());
      p.value.declarations.map((d) => {
        // debug("declaration", d);

        if (d.type === "VariableDeclarator") {
          if (d.init?.type === "Identifier" && d.init.name === name) {
            // const theVariable = theValue;
            if (d.id.type === "Identifier") {
              debug("convert to async/await:", d.id.name);
              if (
                convertAllCallExpressionToAsync(d.id.name, rootCollection, j)
              ) {
                fileChanged = true;
              }
            }
          }

          if (
            d.init?.type === "ObjectExpression" &&
            d.id.type === "Identifier"
          ) {
            const objectName = d.id.name;
            d.init.properties.map((dp) => {
              // debug("****ObjectExpression", dp);
              if (
                dp.type === "ObjectProperty" &&
                dp.value.type === "Identifier" &&
                dp.value.name === name &&
                dp.key.type === "Identifier"
              ) {
                debug("convert to async/await:", objectName);
                if (
                  convertAllMemberExpressionCallToAsync(
                    objectName,
                    dp.key.name,
                    rootCollection,
                    j
                  )
                ) {
                  fileChanged = true;
                }
              }
            });
          }
        }
      });
      return null;
    });
  };

  // find all function definitions
  rootCollection.find(j.Function).map((p) => {
    // debug("Function", p.value);
    switch (p.value.type) {
      case "FunctionDeclaration":
        debug("FunctionDeclaration", p.value.id?.loc?.start);
        // check if async function
        if (p.value.async && p.value.id?.name) {
          debug("async function name:", p.value.id.name);
          if (
            convertAllCallExpressionToAsync(p.value.id?.name, rootCollection, j)
          ) {
            fileChanged = true;
          }
          findVariableAssignments(p.value.id?.name);
        }
        break;
      case "ArrowFunctionExpression":
      case "FunctionExpression":
        debug("Function Expression", p.value.loc?.start);
        // check if async function
        if (p.value.async) {
          switch (p.parentPath.value.type) {
            case "VariableDeclarator":
              debug("async function name:", p.parentPath.value.id.name);
              if (
                convertAllCallExpressionToAsync(
                  p.parentPath.value.id.name,
                  rootCollection,
                  j
                )
              ) {
                fileChanged = true;
              }
              findVariableAssignments(p.parentPath.value.id.name);
              break;
            case "ObjectProperty": {
              debug("the property", p.parentPath.value.key.name);
              const parentObject = findParentObject(p.parentPath);
              // debug("parent object", parentObject);
              if (
                parentObject?.value.type === "VariableDeclarator" &&
                parentObject.value.id.type === "Identifier"
              ) {
                debug("object name:", parentObject.value.id.name);
                if (
                  convertAllMemberExpressionCallToAsync(
                    parentObject.value.id.name,
                    p.parentPath.value.key.name,
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
              debug("Unhandled parent type:", p.parentPath.value.type);
          }
        }
        break;
      // case "ClassMethod":
      //   debug("ClassMethod", p.value.loc?.start);
      //   debug("p.value", p.value);
      //   // check if async function
      //   if (p.value.async) {

      //   }
      //   break;
      default:
        debug("Unhandled function type:", p.value.type);
    }
    return null;
  });

  if (fileChanged) {
    debug2("file changed: ", fileInfo.path);
    return rootCollection.toSource();
  }
};
