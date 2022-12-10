# meteor async migration

This tool helps us to migrate existing codebase to support new async API in Meteor version 2.8

## Install jscodeshift toolkit

What is jscodeshift? https://github.com/facebook/jscodeshift
Linux: Run `sudo npm install -g jscodeshift`

## Features

### Step 1: Convert current APIs to new Meteor Async/Await APIs

Example: convert `Links.findOne()` to `await Links.findOneAsync()`
It also convert the function which uses these new async apis to async function.

Command: `jscodeshift -t transform.ts YOUR_CODEBASE_DIR --parser=tsx`

### Step 2: Handle async function export/import

After step 1, you exported async functions, you must scan you codebase, find all async function import, work with those function calls (add await expression), and change the function which has those calls (add async expression).

Command: `jscodeshift -t transform-export-async-function.ts YOUR_CODEBASE_DIR --parser=tsx`

_You may need to run more than one time until you got no modified file._

## Run against sample files

- `npm run debug:samples`
- `npm run debug:sample:methods`
- `npm run debug:sample:publications`
- `npm run debug:sample:utils`
- `npm run debug:handle-async-import:samples`

## Run against your codebase

**ATTENTION:** You might want to modify these files to fit your code base:

- `transform.ts` at line 100
- `transform-export-async-function.ts` at line 18

Use `jscodeshift` command directly
Run `jscodeshift --help` for more information
