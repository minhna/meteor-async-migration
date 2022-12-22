import React, { useEffect } from "react";

const AExported = ({ as1, as2 }) => {
  useEffect(() => {
    as1();
    as2();
  }, []);

  return <div>A exported</div>;
};

export function BExported({ as2 }) {
  const handleClick = () => {
    as2();
  };

  return <div>Second exported</div>;
}
