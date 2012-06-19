(function($) {
  $(document).ready(function () {

    window.Player = Backbone.Model.extend({
      defaults: {
        currentAlbumIndex: 0,
        currentTrackIndex: 0,
        state: 'stop'
      },
      initialize: function() {
        this.playlist = new Playlist;
      },
      isStopped: function() {
        return (!this.isPlaying());
      },
      isPlaying: function() {
        return this.get('state') === 'play';
      },
      play: function() {
        this.set({state: 'play'});
      },
      pause: function() {
        this.set({state: 'pause'});
      },
      nextTrack: function() {
        if (this.currentAlbum().isLastTrack(this.get('currentTrackIndex')) ) {
          // last track of album
          if (this.playlist.isLastAlbum(this.get('currentAlbumIndex'))) {
            // last album of playlist
            this.set({currentAlbumIndex: 0});
          }else{
            this.changeAlbum(1);
          }

          this.set({currentTrackIndex: 0})
        }else{
          this.changeTrack(1);
        }

      },
      prevTrack: function() {
        if (this.currentAlbum().isFirstTrack(this.get('currentTrackIndex')) ) {
          // first track of album
          if (this.playlist.isFirstAlbum(this.get('currentAlbumIndex'))) {
            // first album
            this.set({currentAlbumIndex: this.playlist.models.length - 1});
            this.set({currentTrackIndex: this.currentAlbum().get('tracks').length - 1})
          }else{
            // not first album
            this.changeAlbum(-1);
            this.set({currentTrackIndex: this.currentAlbum().get('tracks').length - 1})
          }
        }else{
          this.changeTrack(-1);
        }

      },
      changeAlbum: function(delta) {
        this.set({currentAlbumIndex: this.attributes.currentAlbumIndex + delta});
      },
      changeTrack: function(delta) {
        this.set({currentTrackIndex: this.attributes.currentTrackIndex + delta});
      },

      currentAlbum: function() {
        return this.playlist.at(this.get('currentAlbumIndex'));
      },

      currentTrackUrl: function() {
        if (this.currentAlbum()) {
          return this.currentAlbum().trackUrlAtIndex(this.get('currentTrackIndex'));
        }
      },


    });

    window.Album = Backbone.Model.extend({

      isFirstTrack: function(index) {
        return index == 0;
      },

      isLastTrack: function(index) {
        return index == (this.get('tracks').length - 1);
      },

      trackUrlAtIndex: function(index) {
        if (this.get('tracks').length >= index)
          return this.get('tracks')[index].url;

        return null;
      },
    });

    window.Albums = Backbone.Collection.extend({
      model: Album,
      url: '/albums'

    });

    window.Playlist = Albums.extend({
      isFirstAlbum: function(index) {
        return index === 0;
      },

      isLastAlbum: function(index) {
        return index === (this.models.length - 1);
      },

      indexOf: function(model) {
        return this.models.indexOf(model);
      },
    });

    window.library = new Albums;
    window.player = new Player;

    window.AlbumView = Backbone.View.extend({
      template: _.template($('#album-template').html()),
      tagName: 'li',
      className: 'album',

      initialize: function() {
        _.bindAll(this, 'render');
        this.model.bind('change', this.render);

      },

      render: function() {
        var renderedContent = this.template(this.model.toJSON());
        $(this.el).html(renderedContent);
        return this;
      }
    });

    window.LibraryAlbumView = AlbumView.extend({
      events: {
        'click .queue.add': 'select',

      },

      select: function() {
        this.collection.trigger('select', this.model);
      },

    });

    window.PlaylistAlbumView = AlbumView.extend({
      events: {
        'click .queue.remove': 'removeFromPlaylist',
        'click li': 'goToTrack'
      },

      initialize: function() {
        _.bindAll(this, 'render', 'remove', 'updateState', 'updateTrack');

        this.player = this.options.player;
        this.player.bind('change:state', this.updateState);
        this.player.bind('change:currentTrackIndex', this.updateTrack);

        this.playlist = this.player.playlist

        this.model.bind('remove', this.remove);
      },

      updateState: function() {
        var isAlbumCurrent = (this.player.currentAlbum() == this.model);
        $(this.el).toggleClass('current', isAlbumCurrent);

      },

      updateTrack: function() {
        var isAlbumCurrent = (this.player.currentAlbum() === this.model);
        if (isAlbumCurrent) {
          var currentTrackIndex = this.player.get('currentTrackIndex');
          this.$('li').each(function(index, el) {
            $(el).toggleClass('current', (index === currentTrackIndex));
          });
        }
        this.updateState();
      },

      removeFromPlaylist: function() {
        if (this.model === this.player.currentAlbum()) {
          // stop player and reset album & track if currently playing album is removed
          this.player.set({currentAlbumIndex:0, currentTrackIndex:0, state:'stop'});
        }else if(this.playlist.indexOf(this.model) < this.playlist.indexOf(this.player.currentAlbum())){
          // adjust the 'currentAlbumIndex' state attribute on player to reflect its changed position in the playlist array
          this.player.attributes.currentAlbumIndex -= 1;
        }

        this.options.playlist.remove(this.model);
      },

      goToTrack: function(event) {
        var target = $(event.target).parent();

        // looking to dom to find index of clicked track? subject to break if markup changes.
        // this is against backbones MVC pattern. fix it.
        trackIndex = $(target).parents('ol').children().index(target);

        albumIndex = this.playlist.indexOf(this.model);

        this.player.set({currentAlbumIndex:albumIndex, currentTrackIndex:trackIndex});
      },


    });

    window.PlaylistView = Backbone.View.extend({
      template: _.template($('#playlist-template').html()),
      tagName: 'section',
      className: 'playlist',

      events: {
        'click .play':'play',
        'click .pause':'pause',
        'click .next':'nextTrack',
        'click .prev':'prevTrack'
      },

      initialize: function() {
        _.bindAll(this, 'render', 'renderAlbum', 'queueAlbum', 'updateState', 'updateTrack');
        // this.collection.bind('refresh', this.render);
        this.collection.bind('add', this.renderAlbum);

        this.player = this.options.player;
        this.player.bind('change:state', this.updateState);
        this.player.bind('change:currentTrackIndex', this.updateTrack);

        this.library = this.options.library;
        this.library.bind('select', this.queueAlbum);

        this.createAudio();
      },

      createAudio: function() {
        this.audio = new Audio();
      },

      render: function() {
        $(this.el).html(this.template(this.player.toJSON()));

        this.updateState();

        return this;
      },

      updateState: function() {
        this.updateTrack();

        this.$('button.play').toggle(this.player.isStopped());
        this.$('button.pause').toggle(this.player.isPlaying());
      },

      updateTrack: function() {
        this.audio.src = this.player.currentTrackUrl();
        if (this.player.isPlaying()) {
          this.audio.play();
        }else{
          this.audio.pause();
        }
      },

      play: function() {
        if (this.player.playlist.models.length > 0) {
          this.player.play();

          if (this.player.get('currentTrackIndex') === 0) {
            this.$('.tracks>li').first().toggleClass('current');
          }
        }
      },
      pause: function() {
        this.player.pause();
      },
      nextTrack: function() {
        this.player.nextTrack();
      },
      prevTrack: function() {
        this.player.prevTrack();
      },

      queueAlbum: function(album) {
        this.collection.add(album);
      },
      renderAlbum: function(album) {
        var view = new PlaylistAlbumView({
          model: album,
          player: this.player,
          playlist: this.collection
        });

        this.$('ul').append(view.render().el);
      },

    });

    window.LibraryView = Backbone.View.extend({
      tagName: 'section',
      className: 'library',

      initialize: function() {
        _.bindAll(this, 'render');
        this.template = _.template($('#library-template').html());
        this.collection.bind('reset', this.render);
      },

      render: function() {

        var $albums;
        var collection = this.collection;

        $(this.el).html(this.template({}));
        $albums = this.$('.albums');
        collection.each(function(album) {
          var view = new LibraryAlbumView({
            model: album,
            collection: collection
          });

          $albums.append(view.render().el);
        });
        return this;
      },

    });

    window.BackboneTunes = Backbone.Router.extend({
      routes: {
        '': 'home',
        'blank': 'blank'
      },

      initialize: function() {

        this.playlistView = new PlaylistView({
          collection: window.player.playlist,
          player: window.player,
          library: window.library
        });
        this.libraryView = new LibraryView({
          collection: window.library
        });
      },

      home:  function() {
        var $container = $('#container');
        $container.empty();
        $container.append(this.playlistView.render().el);
        $container.append(this.libraryView.render().el);
      },

    });

    $(function() {
      window.App = new BackboneTunes();
      Backbone.history.start({pushState:true});
    });

  });


})(jQuery);
