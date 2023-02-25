import { Meteor } from "meteor/meteor";

interface TestProps {
  b: boolean;
}

export type TestArrayType = {
  a: boolean;
};

export const testReturnType = ({ b }: TestProps): TestArrayType[] => {
  // trigger the converting async function
  Meteor.users.findOne({});

  return [{ a: true }];
};

export const testReturnType2 = async (): Promise<boolean> => {
  // trigger the converting async function
  Meteor.users.findOne({});

  return true;
};
