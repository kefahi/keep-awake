function keep-awake --description 'Toggle a lock that blocks suspend, including on lid close'
    if systemctl --user --quiet is-active keep-awake
        systemctl --user stop keep-awake
        and echo "keep-awake: off, the laptop can sleep again"
    else
        systemd-run --user --quiet --collect --unit=keep-awake \
            systemd-inhibit --what=sleep:handle-lid-switch --why="keep awake" sleep infinity
        and echo "keep-awake: on, the laptop won't sleep; closing the lid locks the screen (Awake & Locked extension)"
    end
end
