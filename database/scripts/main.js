/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
"use strict";

// Shortcuts to DOM Elements.
var messageForm = document.getElementById("message-form");
var translationInput = document.getElementById("new-post-message");
var proverbInput = document.getElementById("new-post-title");
var signInButton = document.getElementById("sign-in-button");
var signOutButton = document.getElementById("sign-out-button");
var splashPage = document.getElementById("page-splash");
var addProverb = document.getElementById("add-post");
var addButton = document.getElementById("add");
var recentProverbsSection = document.getElementById("recent-posts-list");
var userProverbsSection = document.getElementById("user-posts-list");
var topUserProverbsSection = document.getElementById("top-user-posts-list");
var recentMenuButton = document.getElementById("menu-recent");
var myProverbsMenuButton = document.getElementById("menu-my-posts");
var myTopProverbsMenuButton = document.getElementById("menu-my-top-posts");
var listeningFirebaseRefs = [];

/**
 * Saves a new post to the Firebase DB.
 */
function writeNewPost(uid, username, picture, proverb, translation) {
  // A post entry.
  var postData = {
    author: username,
    uid: uid,
    text: proverb,
    translation: translation,
    starCount: 0,
    authorPic: picture,
  };

  // Get a key for a new Post.
  var newPostKey = firebase.database().ref().child("proverbs").push().key;

  // Write the new post's data simultaneously in the posts list and the user's post list.
  var updates = {};
  updates["/proverbs/" + newPostKey] = postData;
  updates["/user-proverbs/" + uid + "/" + newPostKey] = postData;

  return firebase.database().ref().update(updates);
}

/**
 * Star/unstar post.
 */
function toggleStar(postRef, uid) {
  postRef.transaction(function (post) {
    if (post) {
      if (post.stars && post.stars[uid]) {
        post.starCount--;
        post.stars[uid] = null;
      } else {
        post.starCount++;
        if (!post.stars) {
          post.stars = {};
        }
        post.stars[uid] = true;
      }
    }
    return post;
  });
}

/**
 * Creates a post element.
 */
function createPostElement(
  postId,
  proverb,
  translation,
  author,
  authorId,
  authorPic
) {
  var uid = firebase.auth().currentUser.uid;

  var html =
    '<div class="post post-' +
    postId +
    " mdl-cell mdl-cell--12-col " +
    'mdl-cell--6-col-tablet mdl-cell--4-col-desktop mdl-grid mdl-grid--no-spacing">' +
    '<div class="mdl-card mdl-shadow--2dp">' +
    '<div class="mdl-card__title mdl-color--light-blue-600 mdl-color-text--white">' +
    '<h4 class="mdl-card__title-text"></h4>' +
    "</div>" +
    '<div class="header">' +
    "<div>" +
    '<div class="avatar"></div>' +
    '<div class="username mdl-color-text--black"></div>' +
    "</div>" +
    "</div>" +
    '<span class="star">' +
    '<div class="not-starred material-icons">star_border</div>' +
    '<div class="starred material-icons">star</div>' +
    '<div class="star-count">0</div>' +
    "</span>" +
    '<div class="text"></div>' +
    '<div class="comments-container"></div>' +
    '<form class="add-comment" action="#">' +
    '<div class="mdl-textfield mdl-js-textfield">' +
    '<input class="mdl-textfield__input new-comment" type="text">' +
    '<label class="mdl-textfield__label">Comment...</label>' +
    "</div>" +
    "</form>" +
    "</div>" +
    "</div>";

  // Create the DOM element from the HTML.
  var div = document.createElement("div");
  div.innerHTML = html;
  var postElement = div.firstChild;
  if (componentHandler) {
    componentHandler.upgradeElements(
      postElement.getElementsByClassName("mdl-textfield")[0]
    );
  }

  var addCommentForm = postElement.getElementsByClassName("add-comment")[0];
  var commentInput = postElement.getElementsByClassName("new-comment")[0];
  var star = postElement.getElementsByClassName("starred")[0];
  var unStar = postElement.getElementsByClassName("not-starred")[0];

  // Set values.
  postElement.getElementsByClassName("text")[0].innerText = translation;
  postElement.getElementsByClassName(
    "mdl-card__title-text"
  )[0].innerText = proverb;
  postElement.getElementsByClassName("username")[0].innerText =
    author || "Anonymous";
  postElement.getElementsByClassName("avatar")[0].style.backgroundImage =
    'url("' + (authorPic || "./silhouette.jpg") + '")';

  // Listen for comments.
  var commentsRef = firebase.database().ref("post-comments/" + postId);
  commentsRef.on("child_added", function (data) {
    addCommentElement(
      postElement,
      data.key,
      data.val().text,
      data.val().author
    );
  });

  commentsRef.on("child_changed", function (data) {
    setCommentValues(postElement, data.key, data.val().text, data.val().author);
  });

  commentsRef.on("child_removed", function (data) {
    deleteComment(postElement, data.key);
  });

  // Listen for likes counts.
  var starCountRef = firebase.database().ref("posts/" + postId + "/starCount");
  starCountRef.on("value", function (snapshot) {
    updateStarCount(postElement, snapshot.val());
  });

  // Listen for the starred status.
  var starredStatusRef = firebase
    .database()
    .ref("posts/" + postId + "/stars/" + uid);
  starredStatusRef.on("value", function (snapshot) {
    updateStarredByCurrentUser(postElement, snapshot.val());
  });

  // Keep track of all Firebase reference on which we are listening.
  listeningFirebaseRefs.push(commentsRef);
  listeningFirebaseRefs.push(starCountRef);
  listeningFirebaseRefs.push(starredStatusRef);

  // Create new comment.
  addCommentForm.onsubmit = function (e) {
    e.preventDefault();
    createNewComment(
      postId,
      firebase.auth().currentUser.displayName,
      uid,
      commentInput.value
    );
    commentInput.value = "";
    commentInput.parentElement.MaterialTextfield.boundUpdateClassesHandler();
  };

  // Bind starring action.
  var onStarClicked = function () {
    var globalPostRef = firebase.database().ref("/posts/" + postId);
    var userPostRef = firebase
      .database()
      .ref("/user-posts/" + authorId + "/" + postId);
    toggleStar(globalPostRef, uid);
    toggleStar(userPostRef, uid);
  };
  unStar.onclick = onStarClicked;
  star.onclick = onStarClicked;

  return postElement;
}

/**
 * Writes a new comment for the given post.
 */
function createNewComment(postId, username, uid, text) {
  firebase
    .database()
    .ref("post-comments/" + postId)
    .push({
      text: text,
      author: username,
      uid: uid,
    });
}

/**
 * Updates the starred status of the post.
 */
function updateStarredByCurrentUser(postElement, starred) {
  if (starred) {
    postElement.getElementsByClassName("starred")[0].style.display =
      "inline-block";
    postElement.getElementsByClassName("not-starred")[0].style.display = "none";
  } else {
    postElement.getElementsByClassName("starred")[0].style.display = "none";
    postElement.getElementsByClassName("not-starred")[0].style.display =
      "inline-block";
  }
}

/**
 * Updates the number of stars displayed for a post.
 */
function updateStarCount(postElement, nbStart) {
  postElement.getElementsByClassName("star-count")[0].innerText = nbStart;
}

/**
 * Creates a comment element and adds it to the given postElement.
 */
function addCommentElement(postElement, id, text, author) {
  var comment = document.createElement("div");
  comment.classList.add("comment-" + id);
  comment.innerHTML =
    '<span class="username"></span><span class="comment"></span>';
  comment.getElementsByClassName("comment")[0].innerText = text;
  comment.getElementsByClassName("username")[0].innerText =
    author || "Anonymous";

  var commentsContainer = postElement.getElementsByClassName(
    "comments-container"
  )[0];
  commentsContainer.appendChild(comment);
}

/**
 * Sets the comment's values in the given postElement.
 */
function setCommentValues(postElement, id, text, author) {
  var comment = postElement.getElementsByClassName("comment-" + id)[0];
  comment.getElementsByClassName("comment")[0].innerText = text;
  comment.getElementsByClassName("fp-username")[0].innerText = author;
}

/**
 * Deletes the comment of the given ID in the given postElement.
 */
function deleteComment(postElement, id) {
  var comment = postElement.getElementsByClassName("comment-" + id)[0];
  comment.parentElement.removeChild(comment);
}

/**
 * Starts listening for new posts and populates posts lists.
 */
function startDatabaseQueries() {
  var myUserId = firebase.auth().currentUser.uid;
  var topUserPostsRef = firebase
    .database()
    .ref("user-posts/" + myUserId)
    .orderByChild("starCount");
  var recentPostsRef = firebase.database().ref("posts").limitToLast(100);
  var userPostsRef = firebase.database().ref("user-posts/" + myUserId);

  var fetchPosts = function (postsRef, sectionElement) {
    postsRef.on("child_added", function (data) {
      var author = data.val().author || "Anonymous";
      var containerElement = sectionElement.getElementsByClassName(
        "posts-container"
      )[0];
      containerElement.insertBefore(
        createPostElement(
          data.key,
          data.val().proverb,
          data.val().translation,
          author,
          data.val().uid,
          data.val().authorPic
        ),
        containerElement.firstChild
      );
    });
    postsRef.on("child_changed", function (data) {
      var containerElement = sectionElement.getElementsByClassName(
        "posts-container"
      )[0];
      var postElement = containerElement.getElementsByClassName(
        "post-" + data.key
      )[0];
      postElement.getElementsByClassName(
        "mdl-card__title-text"
      )[0].innerText = data.val().title;
      postElement.getElementsByClassName(
        "username"
      )[0].innerText = data.val().author;
      postElement.getElementsByClassName("text")[0].innerText = data.val().body;
      postElement.getElementsByClassName(
        "star-count"
      )[0].innerText = data.val().starCount;
    });
    postsRef.on("child_removed", function (data) {
      var containerElement = sectionElement.getElementsByClassName(
        "posts-container"
      )[0];
      var post = containerElement.getElementsByClassName("post-" + data.key)[0];
      post.parentElement.removeChild(post);
    });
  };

  // Fetching and displaying all posts of each sections.
  fetchPosts(topUserPostsRef, topUserProverbsSection);
  fetchPosts(recentPostsRef, recentProverbsSection);
  fetchPosts(userPostsRef, userProverbsSection);

  // Keep track of all Firebase refs we are listening to.
  listeningFirebaseRefs.push(topUserPostsRef);
  listeningFirebaseRefs.push(recentPostsRef);
  listeningFirebaseRefs.push(userPostsRef);
}

/**
 * Writes the user's data to the database.
 */
function writeUserData(userId, name, email, imageUrl) {
  firebase
    .database()
    .ref("users/" + userId)
    .set({
      username: name,
      email: email,
      profile_picture: imageUrl,
    });
}

/**
 * Cleanups the UI and removes all Firebase listeners.
 */
function cleanupUi() {
  // Remove all previously displayed posts.
  topUserProverbsSection.getElementsByClassName(
    "posts-container"
  )[0].innerHTML = "";
  recentProverbsSection.getElementsByClassName("posts-container")[0].innerHTML =
    "";
  userProverbsSection.getElementsByClassName("posts-container")[0].innerHTML =
    "";

  // Stop all currently listening Firebase listeners.
  listeningFirebaseRefs.forEach(function (ref) {
    ref.off();
  });
  listeningFirebaseRefs = [];
}

/**
 * The ID of the currently signed-in User. We keep track of this to detect Auth state change events that are just
 * programmatic token refresh but not a User status change.
 */
var currentUID;

/**
 * Triggers every time there is a change in the Firebase auth state (i.e. user signed-in or user signed out).
 */
function onAuthStateChanged(user) {
  // We ignore token refresh events.
  if (user && currentUID === user.uid) {
    return;
  }

  cleanupUi();
  if (user) {
    currentUID = user.uid;
    splashPage.style.display = "none";
    writeUserData(user.uid, user.displayName, user.email, user.photoURL);
    startDatabaseQueries();
  } else {
    // Set currentUID to null.
    currentUID = null;
    // Display the splash page where you can sign-in.
    splashPage.style.display = "";
  }
}

/**
 * Creates a new post for the current user.
 */
function newPostForCurrentUser(proverb, translation) {
  // [START single_value_read]
  var userId = firebase.auth().currentUser.uid;
  return firebase
    .database()
    .ref("/users/" + userId)
    .once("value")
    .then(function (snapshot) {
      var username = (snapshot.val() && snapshot.val().username) || "Anonymous";
      // [START_EXCLUDE]
      return writeNewPost(
        firebase.auth().currentUser.uid,
        username,
        firebase.auth().currentUser.photoURL,
        proverb,
        translation
      );
      // [END_EXCLUDE]
    });
  // [END single_value_read]
}

/**
 * Displays the given section element and changes styling of the given button.
 */
function showSection(sectionElement, buttonElement) {
  recentProverbsSection.style.display = "none";
  userProverbsSection.style.display = "none";
  topUserProverbsSection.style.display = "none";
  addProverb.style.display = "none";
  recentMenuButton.classList.remove("is-active");
  myProverbsMenuButton.classList.remove("is-active");
  myTopProverbsMenuButton.classList.remove("is-active");

  if (sectionElement) {
    sectionElement.style.display = "block";
  }
  if (buttonElement) {
    buttonElement.classList.add("is-active");
  }
}

// Bindings on load.
window.addEventListener(
  "load",
  function () {
    // Bind Sign in button.
    signInButton.addEventListener("click", function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(provider);
    });

    // Bind Sign out button.
    signOutButton.addEventListener("click", function () {
      firebase.auth().signOut();
    });

    // Listen for auth state changes
    firebase.auth().onAuthStateChanged(onAuthStateChanged);

    // Saves message on form submit.
    messageForm.onsubmit = function (e) {
      e.preventDefault();
      var translation = translationInput.value;
      var proverb = proverbInput.value;
      if (proverb && translation) {
        newPostForCurrentUser(proverb, translation).then(function () {
          myProverbsMenuButton.click();
        });
        translationInput.value = "";
        proverbInput.value = "";
      }
    };

    // Bind menu buttons.
    recentMenuButton.onclick = function () {
      showSection(recentProverbsSection, recentMenuButton);
    };
    myProverbsMenuButton.onclick = function () {
      showSection(userProverbsSection, myProverbsMenuButton);
    };
    myTopProverbsMenuButton.onclick = function () {
      showSection(topUserProverbsSection, myTopProverbsMenuButton);
    };
    addButton.onclick = function () {
      showSection(addProverb);
      translationInput.value = "";
      proverbInput.value = "";
    };
    recentMenuButton.onclick();
  },
  false
);
