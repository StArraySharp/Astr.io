namespace AstrIO.Server.Game;

public static class WorldLockExt
{
    static readonly object _gate = new();
    public static void GameLock(Action action) { lock (_gate) action(); }
}
