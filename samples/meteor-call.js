import { Meteor } from "meteor/meteor";

const test = () => {
  Meteor.call("method");
  Meteor.call("method2", { a: 2 });
  Meteor.call("method3", { a: 3 }, (error, result) => {});
  Meteor.call("method4", { a: 4 }, function (error, result) {});
  Meteor.call("method5").then((error, result) => {});
};
