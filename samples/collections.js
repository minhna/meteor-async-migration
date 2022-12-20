const Codes = new Mongo.Collection("codes");
export const Profiles = new Mongo.Collection("profiles");

export const NamedCodes = Codes;

export const NotACollection = {
  findOne: () => 1,
};

export default Codes;
