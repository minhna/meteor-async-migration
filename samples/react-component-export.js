import React, { useEffect } from "react";
import { BExported, FirstContext } from "./react-component-other-export";

export const FirstExported = ({ as1, as2, ...rest }) => {
  as1();

  useEffect(() => {
    as2();
  }, []);

  return <div>first exported</div>;
};

export function SecondExported({ as1 }) {
  const handleClick = () => {
    as1();
  };

  return <div>Second exported</div>;
}

export const ThirdExported = function ({ as2 }) {
  const { cas1 } = React.useContext(FirstContext);
  const { cas2: cas2Renamed } = useContext(FirstContext);

  useEffect(() => {
    as2();
  }, []);

  const handleClick = () => {
    cas1();
    cas2Renamed();
  };

  return (
    <div>
      <h1>third exported</h1>
      <BExported as2={as2} cas1={cas1} />
    </div>
  );
};

export default SecondExported;
