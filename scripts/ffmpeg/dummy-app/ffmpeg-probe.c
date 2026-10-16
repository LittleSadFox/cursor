#include <libgen.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(void) {
  char raw[4096];
  uint32_t size = sizeof(raw);
  if (_NSGetExecutablePath(raw, &size) != 0) {
    fprintf(stderr, "cannot resolve executable path\n");
    return 1;
  }
  char resolved[4096];
  if (realpath(raw, resolved) == NULL) {
    perror("realpath");
    return 1;
  }
  char *dir = dirname(resolved);
  char probe[4096];
  if (snprintf(probe, sizeof(probe), "%s/ffprobe", dir) >= (int)sizeof(probe)) {
    fprintf(stderr, "ffprobe path too long\n");
    return 1;
  }
  execl(probe, "ffprobe", "-hide_banner", "-version", (char *)NULL);
  perror(probe);
  return 127;
}
