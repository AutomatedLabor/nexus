# 02 — Filesystem

The root filesystem is an **overlay** (kataContainer-style) backed by a `kataShared` volume; writable work directories include `/tmp`, `/var/tmp`, `/home/z` (the user home), and `/home/z/my-project`. Direct `/home`, `/opt`, and `/srv` are read-only. File I/O is fast: 1000 small files in **0.28 s** (~3,580 files/s) and a 100 MB bulk write at **~2.7 GB/s** (cached path to tmpfs-backed overlay). Symlinks and case-sensitive filenames both behave normally.

---

## Root tree — `find / -maxdepth 3 -type d 2>/dev/null | grep -vE "^/(proc|sys|dev)" | head -80`
```text
/
/etc
/etc/rc2.d
/etc/selinux
/etc/ld.so.conf.d
/etc/xdg
/etc/xdg/systemd
/etc/dpkg
/etc/dpkg/dpkg.cfg.d
/etc/dpkg/origins
/etc/ssh
/etc/ssh/ssh_config.d
/etc/vim
/etc/.java
/etc/.java/.systemPrefs
/etc/perl
/etc/perl/Net
/etc/rc0.d
/etc/modules-load.d
/etc/libreoffice
/etc/libreoffice/registry
/etc/mysql
/etc/mysql/conf.d
/etc/mysql/mariadb.conf.d
/etc/rc1.d
/etc/systemd
/etc/systemd/user
/etc/systemd/network
/etc/systemd/system
/etc/python3
/etc/dconf
/etc/dconf/db
/etc/bash_completion.d
/etc/vulkan
/etc/vulkan/explicit_layer.d
/etc/vulkan/icd.d
/etc/vulkan/implicit_layer.d
/etc/dbus-1
/etc/dbus-1/session.d
/etc/dbus-1/system.d
/etc/sudoers.d
/etc/kernel
/etc/kernel/postinst.d
/etc/kernel/install.d
/etc/init.d
/etc/credstore.encrypted
/etc/ca-certificates
/etc/ca-certificates/update.d
/etc/profile.d
/etc/ODBCDataSources
/etc/gtk-3.0
/etc/emacs
/etc/emacs/site-start.d
/etc/binfmt.d
/etc/rc3.d
/etc/java-21-openjdk
/etc/java-21-openjdk/jfr
/etc/java-21-openjdk/management
/etc/java-21-openjdk/security
/etc/apparmor.d
/etc/apparmor.d/local
/etc/X11
/etc/X11/Xreset.d
/etc/X11/Xsession.d
/etc/X11/xkb
/etc/X11/Xresources
/etc/X11/xorg.conf.d
/etc/X11/fonts
/etc/apt
/etc/apt/sources.list.d
/etc/apt/auth.conf.d
/etc/apt/trusted.gpg.d
/etc/apt/keyrings
/etc/apt/apt.conf.d
/etc/apt/preferences.d
/etc/rc6.d
/etc/terminfo
/etc/ImageMagick-7
/etc/pam.d
/etc/lighttpd
```

## Writable test — `touch $d/.atlas_wtest_$$ && rm`
```text
/tmp: WRITABLE
/var/tmp: WRITABLE
/home: NOT WRITABLE
/opt: NOT WRITABLE
/srv: NOT WRITABLE
/home/z: WRITABLE
/home/z/my-project: WRITABLE
```
(`$HOME` = `/home/z`.)

## File creation speed — 1000 small files
```text
mkdir -p /tmp/atlas-fs-test
t0=$(python3 -c "import time; print(time.time())")
for i in $(seq 1 1000); do echo "x $i" > /tmp/atlas-fs-test/f_$i.txt; done
t1=$(python3 -c "import time; print(time.time())")
python3 -c "print('1000 files in %.4fs' % ($t1 - $t0))"
```
Output:
```text
1000 files in 0.2789s
```
→ **~3,586 files/s**.

## Large file write — 100 MB from `/dev/zero`
```text
dd if=/dev/zero of=/tmp/atlas-100mb.bin bs=1M count=100
```
Output:
```text
104857600 bytes (105 MB, 100 MiB) copied, 0.0384011 s, 2.7 GB/s
100MB in 0.0521s
-rw-rw-r-- 1 z z 104857600 Nov 11 10:55 /tmp/atlas-100mb.bin
```

## Symlink test
```text
ln -s /etc/hostname /tmp/atlas-link && readlink /tmp/atlas-link
```
Output:
```text
symlink created OK
/etc/hostname
```
→ Symlinks are **supported** on `/tmp` (overlay upperdir).

## Case sensitivity test
```text
touch /tmp/AtlasTest /tmp/atltest
ls -la /tmp/AtlasTest /tmp/atltest
```
Output:
```text
-rw-rw-r-- 1 z z 0 Nov 11 10:55 /tmp/AtlasTest
-rw-rw-r-- 1 z z 0 Nov 11 10:55 /tmp/atltest
```
→ Both files coexist independently — filesystem is **case-sensitive**.

---

## Notes
- `bc` is **not installed**; timing was done with `python3 -c "import time; print(time.time())"` instead.
- The root overlay (`c-6af44108-...-rootfs`) is only 9.9 GB with 6.0 GB free; `/tmp` is on this same root, so large temporary datasets need to be cleaned up.
- `/home/z/my-project/upload` is mounted on `ossfs` (16 EB reported), useful for durable test artifacts.
