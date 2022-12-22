import React, { useEffect } from "react";
import { BExported } from "./react-component-other-export";

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

  return (
    <div>
      <h1>third exported</h1>
      <BExported as2={as2} />
    </div>
  );
};

export default FirstExported;
