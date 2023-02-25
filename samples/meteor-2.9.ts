import { Meteor } from "meteor/meteor";
import { Accounts } from "meteor/accounts-password";
import { Email } from "meteor/email";
import { CssTools } from "meteor/minifier-css";

const test1 = () => {
  Accounts._attemptLogin();
};

const test2 = () => {
  Accounts._loginMethod();
};

const test3 = () => {
  Accounts._runLoginHandlers();
};

const test4 = () => {
  Accounts._checkPassword();
};

const test5 = () => {
  Email.send();
};

const test6 = () => {
  Meteor.user();
};

const test7 = () => {
  CssTools.minifyCss();
};

const test8 = () => {
  Accounts.createUserVerifyingEmail();
};
