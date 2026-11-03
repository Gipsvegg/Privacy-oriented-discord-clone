// @ts-check
//click handler for manage friends
document.addEventListener('click', async (e) => {
    const link = e.target.closest('.sidebar a.manage-friends');
    if(!link) return;
    e.preventDefault();

    document.querySelectorAll('.sidebar a.active').forEach((element) => { 
        element.classList.remove('active');
    });
    link.classList.add('active');
    const icon = link.querySelector('i');
    icon.classList.remove('bi-people');
    icon.classList.add('bi-people-fill');

    const res = await fetch(link.href);
    if (!res.ok) return;
    document.getElementById('message-area').innerHTML = await res.text();
})

document.addEventListener('submit', async (e) => {
    const form = e.target;
    if(form.id !== 'friend-form') return;
    
    e.preventDefault();
    const formData = new FormData(form);
    //const submit = form.querySelector('button[type="submit"]');
    
    await fetch(form.action, {
        method: 'POST',
        body: formData,
    });
})

async function refreshFriends(){
    const friendManager = document.getElementById('friend-manager');
    if(!friendManager) return;
    
    const res = await fetch('/Dashboard/ManageFriends')
    if(!res.ok) return;
    friendManager.innerHTML = await res.text();
    await refreshFriendsList();
}