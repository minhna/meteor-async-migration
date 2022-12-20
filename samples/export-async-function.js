export const first = async () => {};

export async function second() {}

const third = async function () {};

export async function fourth() {}

export default third;

export const aVariable = { hello: "world" };

first();

second();

third();

fourth();

function a() {
  first();
}

const F = {
  first,
  otherFirst: first,
  third,
  fourth,
  fif: async () => {},
};

const theFirst = first;

F.first();
F.otherFirst();
F.fif();
theFirst();

export const Profiles = new Mongo.Collection("profiles");
