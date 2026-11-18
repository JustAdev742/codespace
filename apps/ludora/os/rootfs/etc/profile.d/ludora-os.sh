# Ludora OS: sessions left idle for 15 minutes are closed, and new files are private by default.
if [ -z "${TMOUT:-}" ]; then
  TMOUT=900
  readonly TMOUT
  export TMOUT
fi
umask 027
case "$-" in
  *i*)
    if [ -t 0 ] && id -nG 2>/dev/null | grep -qw ludora-admins; then
      echo "Ludora OS. Type  ludora  for the console, or  sudo ludoractl status  for a summary."
    fi
    ;;
esac
