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
  Collection,
  file,
} from "jscodeshift";

const tsParser = require("jscodeshift/parser/ts");

const debug = require("debug")("transform:export-async-script");
const debug2 = require("debug")("transform:print:export-async-script");

import {
  convertAllCallExpressionToAsync,
  convertAllMemberExpressionCallToAsync,
  getFileContent,
  getRealImportSource,
} from "./utils";
import * as fs from "node:fs";

module.exports = function (fileInfo: FileInfo, { j }: API, options: Options) {
  debug(
    `\n**************************************************
*** ${fileInfo.path}
**************************************************\n`
  );

  let fileChanged = false;

  const rootCollection = j(fileInfo.source);

  function isVariableDeclarationAsync(
    importedRootCollection: Collection<any>,
    name: string
  ): boolean {
    return (
      importedRootCollection.find(j.VariableDeclaration).some((d) => {
        // debug("declaration", d.value.declarations);
        return d.value.declarations.some((d) => {
          if (d.type === "VariableDeclarator") {
            if (d.id.type === "Identifier") {
              if (d.id.name === name) {
                // debug("found variable", d);
                // check is async function
                if (
                  d.init?.type === "FunctionExpression" ||
                  d.init?.type === "ArrowFunctionExpression"
                ) {
                  if (d.init.async) {
                    return true;
                  }
                }
              }
            }
          }
          return false;
        });
      }) ||
      importedRootCollection.find(j.FunctionDeclaration).some((d) => {
        return (
          d.value.id?.type === "Identifier" &&
          d.value.id.name === name &&
          d.value.async
        );
      })
    );
  }
  // function to read the export source file, then check for exported async function

  function resolve(fileSource, currentPath) {
    const realImportSource = getRealImportSource(fileSource, currentPath);
    const { realPath } = getFileContent(realImportSource);
    if (realPath == null) {
      debug2("not found", fileSource, currentPath, realImportSource);
    }
    return realPath;
  }
  function analyzeSource(sourcePath): Set<string> {
    debug("===analyze source begin:", sourcePath);

    if (!/\.(ts|tsx|js|jsx)$/.test(sourcePath)) {
      return new Set();
    }
    const contents = fs.readFileSync(sourcePath, { encoding: "utf-8" });
    if (!contents) {
      return new Set();
    }
    // debug2('attempting to analyse', sourcePath)
    const col = j(contents, { parser: tsParser });
    // debug(
    //   "imported root collection",
    //   importedRootCollection,
    //   importedRootCollection.toSource()
    // );

    const asyncExports = new Set<string>();
    col.find(j.ExportNamedDeclaration).forEach((sp) => {
      const node = sp.node;

      if (node.source && typeof node.source.value === "string") {
        const otherPath =
          node.source.value.startsWith(".") || node.source.value.startsWith("/")
            ? resolve(node.source.value, sourcePath)
            : null;
        if (otherPath != null) {
          const srcAsyncs = analyzeSource(otherPath);
          for (const spec of node.specifiers) {
            if (srcAsyncs.has(spec.local.name)) {
              asyncExports.add(spec.exported.name);
            }
          }
        }
      } else if (node.declaration == null) {
        for (const spec of node.specifiers) {
          if (isVariableDeclarationAsync(col, spec.local.name)) {
            asyncExports.add(spec.exported.name);
          }
        }
      } else {
        switch (node.declaration?.type) {
          case "FunctionDeclaration":
            // debug("FunctionDeclaration", node.declaration);
            if (node.declaration.id?.name != null && node.declaration.async) {
              asyncExports.add(node.declaration.id?.name);
            }
            break;
          case "VariableDeclaration":
            // debug("VariableDeclaration", node.declaration.declarations);
            node.declaration.declarations.map((d) => {
              if (
                d.type === "VariableDeclarator" &&
                d.id.type === "Identifier" &&
                (d.init?.type === "FunctionExpression" ||
                  d.init?.type === "ArrowFunctionExpression") &&
                d.init.async
              ) {
                // debug("declare variable", d);
                asyncExports.add(d.id.name);
              }
            });
            break;
        }
      }
    });

    const isDefaultAsync = col.find(j.ExportDefaultDeclaration).some((sp) => {
      const node = sp.value;
      switch (node.declaration?.type) {
        case "FunctionDeclaration":
        case "ArrowFunctionExpression":
          return node.declaration.async;
        case "Identifier":
          return isVariableDeclarationAsync(col, node.declaration.name);
        default:
          return false;
      }
    });
    if (isDefaultAsync) {
      asyncExports.add("default");
    }

    return asyncExports;
  }

  // find all imported async functions
  const importedNodes = rootCollection.find(j.ImportDeclaration);
  importedNodes.forEach((p) => {
    const declNode = p.value;
    const isPath =
      typeof declNode.source.value === "string" &&
      (declNode.source.value.startsWith(".") ||
        declNode.source.value.startsWith("/"));
    if (!isPath) {
      return;
    }

    const src = resolve(declNode.source.value, fileInfo.path);
    if (src == null) {
      debug2("did not resolve", j(p).toSource(), "from", fileInfo.path, src);
      return;
    }

    const asyncExports = analyzeSource(src);
    if (asyncExports.size === 0) {
      return;
    }

    for (const spec of declNode.specifiers) {
      if (spec.type === "ImportNamespaceSpecifier") {
        for (const memberName of Array.from(asyncExports)) {
          if (
            convertAllMemberExpressionCallToAsync(
              spec.local.name,
              memberName,
              rootCollection,
              j
            )
          ) {
            fileChanged = true;
          }
        }
      } else if (spec.type === "ImportDefaultSpecifier") {
        if (
          asyncExports.has("default") &&
          convertAllCallExpressionToAsync(spec.local.name, rootCollection, j)
        ) {
          fileChanged = true;
        }
      } else if (spec.type === "ImportSpecifier") {
        if (
          asyncExports.has(spec.imported.name) &&
          convertAllCallExpressionToAsync(spec.local.name, rootCollection, j)
        ) {
          fileChanged = true;
        }
      }
    }

    debug("=====imported node source end=====");
  });

  if (fileChanged) {
    debug2("file changed:", fileInfo.path);
    return rootCollection.toSource();
  }
};
