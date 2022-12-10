import { first, second, aVariable } from "./export-async-function";
import third from "./export-async-function";
import { fourth } from "./export-async-function";

const useFirst = async () => {
  return await first();
};

export async function useSecond() {
  const a = await second();

  return a;
}

export const useThird = async () => {
  return await third();
};

async function main() {
  await third();
  console.log({ aVariable });
}

export const alreadyAsyncAwait = async () => {
  return await fourth();
};

Meteor.methods({
  someMethod: async () => {
    return await fourth();
  },
  async otherMethod() {
    return await fourth();
  },
});
