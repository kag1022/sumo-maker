import { tests as compatTests } from '../compat';
import { TestModule } from '../types';

export const compatTestModule: TestModule = {
  id: 'compat',
  cases: compatTests,
};
