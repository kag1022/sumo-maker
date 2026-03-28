export type TestSuite = 'unit' | 'verification' | 'docs';

export type TestCase = {
  name: string;
  run: () => void | Promise<void>;
  suite?: TestSuite;
};

export type TestModule = {
  id: string;
  cases: TestCase[];
};
