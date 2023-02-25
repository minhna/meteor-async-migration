import { Accounts } from "accounts-password";

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
