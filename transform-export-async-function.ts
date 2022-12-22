/**
 * 1. Open file
 * 2. Find all imports
 * 3. Go to the source, which exported functions/variables
 * 4. Check if the exported variable in source file is async function
 * 5. If it was async function, find all the call expression of that async function
 * 6. Convert them to await expressions
 */

import {
  FileInfo,
  API,
  Options,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
} from "jscodeshift";

const tsParser = require("jscodeshift/parser/ts");

const debug = require("debug")("transform:export-async-script");
const debug2 = require("debug")("transform:print:export-async-script");

import {
  convertAllCallExpressionToAsync,
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

  // function to read the export source file, then check for exported async function
  interface AnalyzeSourceParams {
    exportedFunction: string;
    exportType: "default" | "named";
    fileSource: string;
  }
  const analyzeSource = ({
    exportedFunction,
    exportType,
    fileSource,
  }: AnalyzeSourceParams): boolean => {
    debug("===analyze source begin:", exportType, exportedFunction, fileSource);

    // open file to read
    const realImportSource = getRealImportSource(fileSource, fileInfo.path);
    debug({ realImportSource });

    const { content: fileContent } = getFileContent(realImportSource);
    // debug("content\n", fileContent);

    if (!fileContent) {
      return false;
    }

    const importedRootCollection = j(fileContent, { parser: tsParser });
    // debug(
    //   "imported root collection",
    //   importedRootCollection,
    //   importedRootCollection.toSource()
    // );

    let isAsync = false;

    const handleExportDeclaration = (
      node: ExportDefaultDeclaration | ExportNamedDeclaration
    ) => {
      // debug(node.declaration);
      switch (node.declaration?.type) {
        case "FunctionDeclaration":
          // debug("FunctionDeclaration", node.declaration);
          if (
            node.declaration.id?.name === exportedFunction &&
            node.declaration.async
          ) {
            isAsync = true;
          }
          break;
        case "VariableDeclaration":
          // debug("VariableDeclaration", node.declaration.declarations);
          node.declaration.declarations.map((d) => {
            if (d.type === "VariableDeclarator") {
              if (d.id.type === "Identifier") {
                if (d.id.name === exportedFunction) {
                  // debug("declare variable", d);
                  if (
                    d.init?.type === "FunctionExpression" ||
                    d.init?.type === "ArrowFunctionExpression"
                  ) {
                    if (d.init.async) {
                      isAsync = true;
                    }
                  }
                }
              }
            }
          });
          break;
        case "Identifier":
          debug(
            "Identifier",
            "need to file the function",
            node.declaration.name
          );
          importedRootCollection.find(j.VariableDeclaration).map((d) => {
            // debug("declaration", d.value.declarations);
            d.value.declarations.map((d) => {
              if (d.type === "VariableDeclarator") {
                if (d.id.type === "Identifier") {
                  if (d.id.name === exportedFunction) {
                    // debug("found variable", d);
                    // check is async function
                    if (
                      d.init?.type === "FunctionExpression" ||
                      d.init?.type === "ArrowFunctionExpression"
                    ) {
                      if (d.init.async) {
                        isAsync = true;
                      }
                    }
                  }
                }
              }
            });

            return null;
          });
      }
    };

    // search for exported function
    debug("find all exports");
    switch (exportType) {
      case "default": {
        importedRootCollection.find(j.ExportDefaultDeclaration).map((sp) => {
          debug("export default node:", j(sp).toSource());
          handleExportDeclaration(sp.value);
          return null;
        });
        break;
      }
      case "named": {
        importedRootCollection.find(j.ExportNamedDeclaration).map((sp) => {
          debug("export named node:", j(sp).toSource());
          handleExportDeclaration(sp.value);
          return null;
        });
        break;
      }
    }

    debug("===analyze source end===");

    return isAsync;
  };

  // find all imported async functions
  const importedNodes = rootCollection.find(j.ImportDeclaration);
  importedNodes.map((p) => {
    debug("\n=====imported node source:", j(p).toSource());
    if (!p.value.source.value || typeof p.value.source.value !== "string") {
      return null;
    }
    if (!/^[\/\.]/.test(p.value.source.value)) {
      return null;
    }

    switch (p.value.type) {
      case "ImportDeclaration": {
        p.value.specifiers?.map((spec) => {
          switch (spec.type) {
            case "ImportDefaultSpecifier": {
              debug("====ImportDefaultSpecifier name:", spec.local?.name);
              if (
                spec.local?.name &&
                typeof p.value.source.value === "string"
              ) {
                const isAsyncFunction = analyzeSource({
                  exportedFunction: spec.local?.name,
                  fileSource: p.value.source.value,
                  exportType: "default",
                });
                debug("==>is async function:", isAsyncFunction);
                if (isAsyncFunction) {
                  if (
                    convertAllCallExpressionToAsync(
                      spec.local.name,
                      rootCollection,
                      j
                    )
                  ) {
                    fileChanged = true;
                  }
                }
              }
              break;
            }
            case "ImportSpecifier": {
              debug("====ImportSpecifier name:", spec.local?.name);
              if (
                spec.local?.name &&
                typeof p.value.source.value === "string"
              ) {
                const isAsyncFunction = analyzeSource({
                  exportedFunction: spec.local?.name,
                  fileSource: p.value.source.value,
                  exportType: "named",
                });
                debug("==>is async function:", isAsyncFunction);
                if (isAsyncFunction) {
                  if (
                    convertAllCallExpressionToAsync(
                      spec.local.name,
                      rootCollection,
                      j
                    )
                  ) {
                    fileChanged = true;
                  }
                }
              }
              break;
            }
          }
        });
        break;
      }
    }
    debug("=====imported node source end=====");

    return null;
  });

  if (fileChanged) {
    debug2("file changed:", fileInfo.path);
    return rootCollection.toSource();
  }
};
