var gulp = require('gulp');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var args = require('yargs').argv;
var browserSync = require('browser-sync');
var config = require('./gulp.config')();
var del = require('del');
var $ = require('gulp-load-plugins')({lazy: true});

gulp.task('help', $.taskListing);
gulp.task('default', ['sass', 'copy', 'js-bundle', 'sass-watcher', 'assets-watcher', 'js-watcher']);

gulp.task('sass', function() {
    log('Compiling Sass --> minified CSS');

    var sassOptions = {
        outputStyle: 'compressed' // nested, expanded, compact, compressed
    };

    return gulp
        .src(config.sass)
        .pipe($.sass(sassOptions))
        .pipe(gulp.dest(config.sassDist));
})

gulp.task('copy', function() {
    log('Copying assets');

    return gulp
        .src(config.assets, {base: config.client})
        .pipe(gulp.dest(config.dist + '/'));
});

gulp.task('js-bundle', function() {
    log('bundling js files');

    return gulp
        .src(config.jsFiles)
        .pipe(concat('app.js'))
        .pipe(gulp.dest(config.jsDist));
});

gulp.task('sass-watcher', function() {
    gulp.watch([config.sass], ['sass', 'js-bundle']);
});

gulp.task('assets-watcher', function() {
    gulp.watch([config.assets], ['copy']);
});

gulp.task('js-watcher', function() {
    gulp.watch([config.jsFiles], ['js-bundle']);
})

gulp.task('build', ['optimize', 'copy'], function() {
    startBrowserSync('dist');
});

function log(msg) {
    if (typeof(msg) === 'object') {
        for (var item in msg) {
            if (msg.hasOwnProperty(item)) {
                $.util.log($.util.colors.green(msg[item]));
            }
        }
    } else {
        $.util.log($.util.colors.green(msg));
    }
}
