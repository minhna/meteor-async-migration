# meteor async migration

This tool helps us to migrate existing codebase to support new async API in Meteor version 2.8

## Install jscodeshift toolkit

What is jscodeshift? https://github.com/facebook/jscodeshift
Linux: Run `sudo npm install -g jscodeshift`

## Run against sample files

`npm run debug:samples`
`npm run debug:sample:methods`
`npm run debug:sample:publications`
`npm run debug:sample:utils`

## Run against your codebase

Use `jscodeshift` command directly
Run `jscodeshift --help` for more information
