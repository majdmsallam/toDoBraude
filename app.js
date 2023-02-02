//jshint esversion:6
require('dotenv').config();
const express =require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const passportLocal = require("passport-local");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const findOrCreate = require("mongoose-findorcreate");

const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb+srv://"+process.env.MONGODBUSER+":"+process.env.MONGODBPASS+"@cluster0.tkugskm.mongodb.net/userDB",{useNewUrlParser:true});

const itemsSchema = {
  name: String,
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    //required: true
  },
  when: {
    type: String,
    enum: ['today', 'later'],
    //required: true
  }
};
const Item = mongoose.model("item",itemsSchema);


const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email:String,
  password: String,
  googleId: String,
  facebookId: String,
  items: [itemsSchema]
});




userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User",userSchema);

passport.use(new passportLocal(User.authenticate()));
// passport.serializeUser(User.serializeUser());
// passport.deserializeUser(User.deserializeUser());
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});



passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/list",
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id}, function (err, user) {
      user.firstName=profile.name.givenName;
      user.lastName=profile.name.familyName;
      user.save(function (err) {
      return cb(err, user);
    });
    });
  }
));



passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/list"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get('/auth/facebook',
  passport.authenticate('facebook'));


app.get("/",function(req,res){
  res.render("home");
});

app.get("/auth/google", passport.authenticate('google', {
    scope: ['profile']
}));



app.get('/auth/google/list',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/list');
  });




app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/secrets');
  });


app.get("/login",function(req,res){
  res.render("login");
});
app.get("/register",function(req,res){
  res.render("register");
});


app.get("/logout",function(req,res){
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

app.post("/list",function(req,res){
  const submittedItem = new Item({
    name: req.body.newItem,
    priority:req.body.priority,
    when:req.body.when
  });
  console.log(submittedItem);
  User.findById(req.user._id,function(err,foundUser){
    if(err){
      console.log(err);
    }else{
      if(foundUser){
        foundUser.items.push(submittedItem);
        foundUser.save();
        res.redirect("list");
      }
    }
  });
});


app.get("/list", function(req, res) {

  if(req.isAuthenticated()){
    console.log(req.user._id)
      User.findById(req.user._id,function(err,foundUser){
        if(err){
          console.log(err);
        }else{
          console.log(foundUser);
          Item.find({ _id: { $in: foundUser.items } }, function(error, items) {
          if(error){
            console.log(error);
          }else{
            res.render("list", {listTitle:foundUser.username, newListItems: foundUser.items, theWelcome:foundUser.firstName});
          }
        });
}
      });

}else {
  res.redirect("/login");
}
});



app.post("/register",function(req,res){
  if(req.body.password===req.body.password1){
User.register({username:req.body.username},req.body.password,function(err,user){
  if(err){
    console.log(err);
    res.redirect("/register");
  }else{
    User.updateOne({ username: req.body.username}, { $set: { firstName: req.body.Firstname, lastName: req.body.Lastname } }, function (err) {
    if (err) {
      console.log("hon el error");
        console.log(err);
    } else {
        console.log("Successfully updated the user.")
    }
});
    passport.authenticate("local")(req,res,function(){
      res.redirect("/list");
    });
  }
});
}else{
  console.log("password does not match");
  res.redirect("/register");
}
});



app.post("/login",function(req,res){
  const user= new User({
    username:req.body.username,
    password:req.body.password
  })
  req.login(user,function(err){
    if(err){
      console.log(err);
    }else{
      passport.authenticate("local")(req,res,function(){
        res.redirect("/list");
      });
    }
  });
});

app.post("/delete",function(req,res){
  const checkItemId=req.body.taskid;
  console.log(req.body.taskid);
  User.findById(req.user._id, function(err, user) {
  if(err){
    console.log(err);
  }else{
    console.log(req.body.checkbox);
    User.updateOne({_id:req.user._id}, { $pull: { items: { _id: checkItemId } } }, function(error, user) {
      if(error){
        console.log(error);
      }else{
        console.log("item removed");
        res.redirect("list");
      }
    });
  }
});
});

app.post("/update",function(req,res){
  const checkItemId=req.body.ItemID;
  const newValue=req.body.itemNewName;
  console.log(newValue);
  User.findById(req.user.id, function(err, user) {
    if(err){
      console.log(err);
    }else{
      console.log(req.body.ItemID);
      User.updateOne({_id: req.user.id, "items._id": checkItemId}, { $set: { "items.$.name": newValue }}, function(error, user) {
        if(error){
          console.log(error);
        }else{
          console.log("item updated");
          res.redirect("list");
        }
      });
    }
  });
});

app.get("/changepassword",function(req,res){

  if(req.isAuthenticated()){
      User.findById(req.user._id,function(err,foundUser){
        if(err){
          console.log(err);
        }else{
              res.render("changepassword", {theWelcome:foundUser.firstName});
      }
    });
  }
});

app.post('/changepassword', function (req, res) {
   User.findById(req.user._id, (err, user) => {
       if (err) {
           res.send(err);
       } else if (!user) {
           res.send("User not found");
       } else {
           user.changePassword(req.body.oldpassword,
           req.body.newpassword, function (err) {
               if (err) {
                   res.send(err);
               } else {
                   res.redirect("list");
               }
           });
       }
   });
});
// app.get("/successChagePass",function(req,res){
//
//   if(req.isAuthenticated()){
//       User.findById(req.user.id,function(err,foundUser){
//         if(err){
//           console.log(err);
//         }else{
//               res.render("successChagePass");
//       }
//     });
//   }
// });

app.listen(3000,function(){
  console.log("Server started on server 3000");
});
