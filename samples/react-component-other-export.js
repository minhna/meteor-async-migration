import React, { useEffect } from "react";

const AExported = ({ as1, as2 }) => {
  useEffect(() => {
    as1();
    as2();
  }, []);

  return <div>A exported</div>;
};

export function BExported({ as2, cas1 }) {
  const handleClick = () => {
    as2();
  };

  const handleClick2 = () => {
    cas1();
  };

  return <div>Second exported</div>;
}

export const FirstContext = React.createContext("first");

export const FirstContextProvider = (props) => {
  const { children, cas1 } = props;

  const cas2 = async () => {};

  return (
    <FirstContext.Provider value={{ cas1, cas2 }}>
      {children}
    </FirstContext.Provider>
  );
};
