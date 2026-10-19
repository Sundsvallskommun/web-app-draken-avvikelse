declare module 'session-file-store' {
  import session from 'express-session';

  function createFileStore(session: typeof import('express-session')): new (options?: Record<string, unknown>) => session.Store;
  export default createFileStore;
}
