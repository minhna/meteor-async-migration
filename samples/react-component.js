import React from "react";

const async1 = async () => {};

const FirstComponent = ({ a, b, as1, as2, ...rest }) => {
  as1();

  const fn2 = () => {
    const v2 = as2();
  };

  return (
    <div>
      {a}, {b}
    </div>
  );
};

export const SecondComponent = () => {
  const async2 = async () => {
    const props = { otherProps: "Not valid" };
  };

  const props = {
    c: "C",
    d: ["d1", "d2"],
    s1: () => {},
    s2: async function () {},
  };

  return (
    <div>
      <FirstComponent
        a='A'
        b='B'
        as1={async1}
        as2={async2}
        as3={async () => {}}
        as4={function () {}}
        {...props}
      />
      ;
    </div>
  );
};
