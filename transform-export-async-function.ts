import fs from "fs";

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

const debug = require("debug")("transform:export-async-script");

import {
  addAwaitKeyword,
  convertAllCallExpressionToAsync,
  findParentFunction,
  setFunctionAsync,
} from "./utils";

const METEOR_ROOT_DIRECTORY = "/home/minhna/WORKS/Mike/settler/se2-admin";

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `\n**************************************************
*** ${fileInfo.path}
**************************************************\n`
  );

  const rootCollection = j(fileInfo.source);

  const getPathFromSource = (source: string): string => {
    return source.replace(/\/([^\/]+)$/, "");
  };

  const getRealImportSource = (source: string): string => {
    if (/^\//.test(source)) {
      return METEOR_ROOT_DIRECTORY + source;
    }
    return getPathFromSource(fileInfo.path) + "/" + source.replace(/^\.\//, "");
  };

  const getFileContent = (path: string): string | undefined => {
    let fileContent: Buffer | null = null;

    if (/(\.js|\.ts)$/.test(path)) {
      try {
        fileContent = fs.readFileSync(path);
      } catch (e) {
        debug("File was not found:", path);
      }
    } else {
      try {
        fileContent = fs.readFileSync(path + ".js");
      } catch (e) {
        try {
          fileContent = fs.readFileSync(path + ".ts");
        } catch (e2) {
          // check for index file
          try {
            fileContent = fs.readFileSync(path + "/index.js");
          } catch (e3) {
            try {
              fileContent = fs.readFileSync(path + "/index.ts");
            } catch (e4) {
              debug("File was not found");
            }
          }
        }
      }
    }

    // debug("content", fileContent.toString());
    return fileContent?.toString();
  };

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
    const realImportSource = getRealImportSource(fileSource);
    debug({ realImportSource });

    const fileContent = getFileContent(realImportSource);
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
                  convertAllCallExpressionToAsync(
                    spec.local.name,
                    rootCollection,
                    j
                  );
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
                  convertAllCallExpressionToAsync(
                    spec.local.name,
                    rootCollection,
                    j
                  );
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

  return rootCollection.toSource();
};
