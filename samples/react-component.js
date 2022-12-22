import React from "react";
import FirstExported, {
  SecondExported,
  ThirdExported,
} from "./react-component-export";

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
        f4={function () {}}
        {...props}
      />
      <FirstExported as1={async1} as2={async2} {...props} />
      <SecondExported as1={async1} />
      <ThirdExported as2={async2} />
    </div>
  );
};
