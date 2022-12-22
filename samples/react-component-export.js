import React, { useEffect } from "react";

const FirstExported = ({ as1, as2, ...rest }) => {
  as1();

  useEffect(() => {
    as2();
  }, []);

  return <div>first exported</div>;
};

export function SecondExported({ as1 }) {
  as1();

  return <div>Second exported</div>;
}

export const ThirdExported = function ({ as2 }) {
  as2();

  return <div>third exported</div>;
};

export default FirstExported;
