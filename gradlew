#!/bin/sh
#
# Gradle start up script for UN*X
#

APP_NAME="Gradle"
APP_BASE_NAME=`basename "$0"`

APP_HOME="`pwd -P`"

MAX_FD="maximum"

warn () {
    echo "$*"
}

die () {
    echo
    echo "$*"
    echo
    exit 1
}

OS="`uname`"
case "$OS" in
  MSYS* | MINGW* )
    APP_HOME="`cygpath --path --mixed "$APP_HOME"`"
    ;;
esac

CLASSPATH=$APP_HOME/gradle/wrapper/gradle-wrapper.jar

org.gradle.launcher.GradleMain "$@"

JAVA_OPTS="$JAVA_OPTS \"-Xdock:name=$APP_NAME\" \"-Xdock:icon=$APP_HOME/media/gradle.icns\""

exec "$JAVACMD" "$JAVA_OPTS" $GRADLE_OPTS "\"-Djava.security.manager=allow\"" \
  -classpath "$CLASSPATH" \
  org.gradle.wrapper.GradleWrapperMain \
  "$@"
