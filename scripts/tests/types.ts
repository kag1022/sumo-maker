export type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export type TestModule = {
  id: string;
  cases: TestCase[];
};
