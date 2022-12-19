const first = async () => {
  // no await here
};

const second = async () => {
  const a = 1;
  const b = async () => {
    await first();
  };

  // no await at this level
};

async function third() {
  // no await 2
}

const myObject = {
  myFunction: async () => {
    // no await 3
  },
};
