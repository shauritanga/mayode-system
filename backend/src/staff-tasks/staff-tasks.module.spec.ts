import * as controllers from './staff-tasks.controller';
import { StaffTasksModule } from './staff-tasks.module';

/** A controller that is written and imported but not listed in the module answers 404 for every one of its routes. */
describe('StaffTasksModule', () => {
  it('registers every controller exported by staff-tasks.controller', () => {
    const registered: unknown[] = Reflect.getMetadata('controllers', StaffTasksModule) ?? [];
    const exported = Object.values(controllers).filter((c) => typeof c === 'function' && Reflect.hasMetadata('path', c));
    expect(exported.length).toBeGreaterThan(5);
    const missing = exported.filter((c) => !registered.includes(c)).map((c: any) => c.name);
    expect(missing).toEqual([]);
  });
});
