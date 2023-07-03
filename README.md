# meteor async migration

This tool helps us to migrate existing codebase to support new async API in Meteor version 2.8 and later.

Hopefully he's okay.

![hopfully he survive](https://i.kym-cdn.com/photos/images/newsfeed/001/877/997/621.png)

## Install jscodeshift toolkit

What is jscodeshift? https://github.com/facebook/jscodeshift
Linux: Run `sudo npm install -g jscodeshift`

## Features

Note: if you have .ts files, you'll need to add `--extensions=ts,js` to the command

### 1: Convert current APIs to new Meteor Async/Await APIs

Transform file: **transform.ts**
It will convert the current sync function call (using Fiber) to new async APIs. e.g: convert `Links.findOne()` to `await Links.findOneAsync()`
It also convert the function which uses these new async apis to async function.

Command: `DEBUG="transform:print*" jscodeshift -t transform.ts YOUR_CODEBASE_DIR --parser=tsx`

**ATTENTION:** Only run this script against your **Server APIs**. You should not convert the front-end UI to use these new async functions.

### 2: Scan for async function usages

Transform file: **transform-use-async-functions.ts**

After you converted some sync functions to async. Now you need to find where you use them, and add `await` to those call expressions.
The script will also convert those functions which have `await` expression to async function.

Command: `DEBUG="transform:print*" jscodeshift -t transform-use-async-functions.ts YOUR_CODEBASE_DIR --parser=tsx`

_You may need to run more than one time until you got no modified file._

### 3: Handle async function export/import

Transform file: **transform-export-async-function.ts**

After you converted your functions to async, you may exported some async functions, you must scan you codebase, find all async function imports, work with those function calls (add await expression), and change the function which has those calls (add async expression).

Command: `DEBUG="transform:print*" jscodeshift -t transform-export-async-function.ts YOUR_CODEBASE_DIR --parser=tsx`

_You may need to run more than one time until you got no modified file._

### 4: Convert Meteor.call to Meteor.callAsync

Transform file: **transform-meteor-call.ts**

It will look for `Meteor.call()` which doesn't have callback function arguments, and not followed by `.then()` expression. Convert it to `await Meteor.callAsync()`. It will also change the parent function to async. That's why you may want to run the transform #2 and #3 again.

Command: `DEBUG="transform:print*" jscodeshift -t transform-meteor-call.ts YOUR_CODEBASE_DIR --parser=tsx`

### 5: Work with React Components props

Transform file: **transform-component-props.ts**

Looks for async function passed to React Components via props. Find all those usages then add async/await expression to.
It also works with the **child components** and handle some simple **React Context** usages. You may want to run #2 again.

Command: `DEBUG="transform:print*" jscodeshift -t transform-component-props.ts YOUR_CODEBASE_DIR --parser=tsx`

### 6: React Components - withTracker

Transform file: **transform-component-props-withTracker.ts**

If you use `withTracker` to wrap your react components, you may want to run this script. It will find the async functions inside the `withTracker` function prop then works with the react component which wrapped in withTracker call. You may want to run #2 after this.

Command: `DEBUG="transform:print*" jscodeshift -t transform-component-props-withTracker.ts YOUR_CODEBASE_DIR --parser=tsx`

### 7: Other transforms

While converting the codebase, I had some issues so I wrote some transforms to handle those issue:

- Rename function: transform-rename-functions.ts
- Remove `async` from function which doesn't have `await` expression inside: transform-fix-async-overly.ts
- Find `await` expression inside a NOT async function: transform-find-await-without-async.ts
- `Promise.all` doesn't work with `forEach`. This transform find all of them: transform-find-promise-all-foreach.ts

## Run against sample files

- `npm run debug:samples`
- `npm run debug:sample:methods`
- `npm run debug:sample:publications`
- `npm run debug:sample:utils`
- `npm run debug:handle-async-import:samples`

## Run against your codebase

**ATTENTION:** You might want to modify these files to fit your code base:

- `constants.ts`, modify the `METEOR_ROOT_DIRECTORY` value.

Use `jscodeshift` command directly
Run with `--dry -p` options to test if the scrip works
Run `jscodeshift --help` for more information
