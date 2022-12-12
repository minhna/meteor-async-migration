const Factory = {
  create: () => {},
  createAsync: async () => {},
};

const build = () => {};

const buildAsync = () => {};

const create = () => {};

async function sampleOne() {
  Factory.create({ p1: 1, p2: "a" }, 2);
  build(3);
  create({ a: [1, 2], b: { c: 1 } });
}

function sampleTwo() {
  build(3);
}

function sampleThree() {
  create({ a: [1, 2], b: { c: 1 } });
}

function useSampleThree() {
  sampleThree();
}

const useSampleTwo = () => {
  sampleTwo();
};

export function createListingWithPeople(customListingData = {}) {
  const users = createTeam(["CUS", "CON", "PM"]);
  customListingData.persons = users;
  const listing = Factory.create("listings", customListingData);
  return { listing, users: users };
}
